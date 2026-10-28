#include <windows.h>
#include <dwmapi.h>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <unordered_map>
#include <cstdint>
#include <vector>

static std::atomic<bool> g_running{true};

static void stdinListener() {
    std::string line;
    while (std::getline(std::cin, line)) {
        if (line == "stop") {
            g_running.store(false);
            return;
        }
    }
    g_running.store(false);
}

static HWND parseWindowHandleArgument(int argc, char* argv[]) {
    static const std::string prefix = "--window=";

    for (int index = 1; index < argc; ++index) {
        const std::string argument = argv[index];
        if (argument.rfind(prefix, 0) != 0) {
            continue;
        }

        try {
            const auto rawHandle = static_cast<intptr_t>(std::stoll(argument.substr(prefix.size())));
            return reinterpret_cast<HWND>(rawHandle);
        } catch (...) {
            return nullptr;
        }
    }

    return nullptr;
}

// DWM extended frame bounds match the rect the WGC helper crops to, so the
// cursor overlay and the recorded video agree on the same coordinate space.
static bool queryWindowBounds(HWND hwnd, RECT& rect) {
    if (!hwnd || !IsWindow(hwnd)) {
        return false;
    }

    if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_EXTENDED_FRAME_BOUNDS, &rect, sizeof(rect)))) {
        return true;
    }

    return GetWindowRect(hwnd, &rect) != FALSE;
}

// The capture picker used to shell out to PowerShell with an inline Add-Type,
// which pays a ~500 ms C# compile on every open. This mode enumerates the same
// windows in-process so the picker can list them instantly.
static BOOL CALLBACK collectWindow(HWND hwnd, LPARAM lParam) {
    auto* list = reinterpret_cast<std::vector<std::pair<HWND, RECT>>*>(lParam);

    if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) {
        return TRUE;
    }

    const LONG exStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
    // Click-through overlays and tool windows (cursor overlays, HUDs) cover the
    // screen and would win the hit-test, so they are never picker candidates.
    if ((exStyle & WS_EX_TRANSPARENT) != 0 || (exStyle & WS_EX_TOOLWINDOW) != 0) {
        return TRUE;
    }

    BOOL cloaked = FALSE;
    if (SUCCEEDED(DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &cloaked, sizeof(cloaked))) && cloaked) {
        return TRUE;
    }

    RECT bounds{};
    if (!queryWindowBounds(hwnd, bounds)) {
        return TRUE;
    }
    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top) {
        return TRUE;
    }

    list->emplace_back(hwnd, bounds);
    return TRUE;
}

static void printWindowList() {
    std::vector<std::pair<HWND, RECT>> windows;
    EnumWindows(collectWindow, reinterpret_cast<LPARAM>(&windows));

    std::cout << "[";
    for (size_t index = 0; index < windows.size(); ++index) {
        const RECT& bounds = windows[index].second;
        if (index > 0) {
            std::cout << ",";
        }
        std::cout << "{\"id\":" << reinterpret_cast<intptr_t>(windows[index].first)
                  << ",\"x\":" << bounds.left
                  << ",\"y\":" << bounds.top
                  << ",\"width\":" << (bounds.right - bounds.left)
                  << ",\"height\":" << (bounds.bottom - bounds.top) << "}";
    }
    std::cout << "]" << std::endl;
}

static bool sameRect(const RECT& left, const RECT& right) {
    return left.left == right.left && left.top == right.top &&
        left.right == right.right && left.bottom == right.bottom;
}

int main(int argc, char* argv[]) {
    std::setvbuf(stdout, nullptr, _IONBF, 0);

    // Report bounds in physical pixels, matching the native capture helper.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

    for (int index = 1; index < argc; ++index) {
        if (std::string(argv[index]) == "--list-windows") {
            printWindowList();
            return 0;
        }
    }

    const HWND windowHandle = parseWindowHandleArgument(argc, argv);

    std::unordered_map<HCURSOR, std::string> cursorMap;
    cursorMap[LoadCursor(NULL, IDC_ARROW)]    = "arrow";
    cursorMap[LoadCursor(NULL, IDC_IBEAM)]    = "text";
    cursorMap[LoadCursor(NULL, IDC_HAND)]     = "pointer";
    cursorMap[LoadCursor(NULL, IDC_CROSS)]    = "crosshair";
    cursorMap[LoadCursor(NULL, IDC_NO)]       = "not-allowed";
    cursorMap[LoadCursor(NULL, IDC_SIZEWE)]   = "resize-ew";
    cursorMap[LoadCursor(NULL, IDC_SIZENS)]   = "resize-ns";
    cursorMap[LoadCursor(NULL, IDC_SIZEALL)]  = "open-hand";
    cursorMap[LoadCursor(NULL, IDC_WAIT)]     = "arrow";
    cursorMap[LoadCursor(NULL, IDC_APPSTARTING)] = "arrow";

    std::thread listener(stdinListener);
    listener.detach();

    std::string lastType;
    RECT lastBounds{};
    bool hasReportedBounds = false;
    bool hasReportedMissingWindow = false;

    while (g_running.load()) {
        CURSORINFO ci = {};
        ci.cbSize = sizeof(ci);

        if (GetCursorInfo(&ci) && (ci.flags & CURSOR_SHOWING)) {
            auto it = cursorMap.find(ci.hCursor);
            std::string type = (it != cursorMap.end()) ? it->second : "arrow";

            if (type != lastType) {
                lastType = type;
                std::cout << "STATE:" << type << std::endl;
            }
        }

        if (windowHandle) {
            RECT bounds{};
            if (queryWindowBounds(windowHandle, bounds)) {
                if (!hasReportedBounds || !sameRect(bounds, lastBounds)) {
                    lastBounds = bounds;
                    hasReportedBounds = true;
                    hasReportedMissingWindow = false;
                    std::cout << "WINDOW:" << bounds.left << "," << bounds.top << ","
                              << (bounds.right - bounds.left) << ","
                              << (bounds.bottom - bounds.top) << std::endl;
                }
            } else if (!hasReportedMissingWindow) {
                hasReportedMissingWindow = true;
                std::cout << "WINDOW:none" << std::endl;
            }
        }

        Sleep(50);
    }

    return 0;
}
