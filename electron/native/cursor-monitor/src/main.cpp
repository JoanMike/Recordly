#include <windows.h>
#include <dwmapi.h>
#include <cstdio>
#include <iostream>
#include <string>
#include <thread>
#include <atomic>
#include <unordered_map>
#include <cstdint>

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

static bool sameRect(const RECT& left, const RECT& right) {
    return left.left == right.left && left.top == right.top &&
        left.right == right.right && left.bottom == right.bottom;
}

int main(int argc, char* argv[]) {
    std::setvbuf(stdout, nullptr, _IONBF, 0);

    // Report bounds in physical pixels, matching the native capture helper.
    SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

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
