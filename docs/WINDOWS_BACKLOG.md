# Plan de trabajo — Recordly en Windows (fork JoanMike)

> Documento vivo. Base: `main` del fork, commit `109ca3a` (upstream `webadderallorg/Recordly`, 24-oct-2026).
> Objetivo: estabilizar y optimizar Recordly en Windows 10/11 antes de tocar features.

## 1. Estado de partida

| Dato | Valor |
|---|---|
| Issues abiertos (excluye PRs) | 272 |
| Issues que mencionan Windows | 73 |
| Etiquetados `priority` | 6 |
| Helpers nativos Windows | `wgc-capture.exe`, `cursor-monitor.exe`, `recordly-gpu-export.exe`, `recordly-nvidia-cuda-compositor.exe` (binarios precompilados ya commiteados) |
| Toolchain necesaria | Node 24+, Visual Studio 2026 con workload C++, CMake embebido en VS, Python 3.11 (node-gyp) |

## 2. Hallazgos verificados en código (antes de tocar nada)

### 2.1 El crop de ventana se recalcula por frame, pero el cursor se normaliza con bounds muestreados por PowerShell

- `electron/ipc/cursor/bounds.ts:230-245` refresca los bounds de la ventana cada **250 ms**.
- `electron/ipc/windowsWindowControl.ts:30-99` implementa ese refresco lanzando **`powershell.exe` con `Add-Type`** (compila C# en memoria en cada llamada).
- Medición en esta máquina: **~490-590 ms por invocación**, sin ventana real que consultar. Con la ventana real es igual o peor.
- Efecto: con un intervalo de 250 ms y llamadas de ~500 ms, los bounds llegan con **~0,5-1 s de retraso** y se solapan invocaciones. Si la ventana se mueve, cambia de tamaño o hace scroll animado, el cursor normalizado (`electron/ipc/cursor/telemetry.ts:181-199`) queda desfasado respecto al frame que captura el helper nativo (que recalcula el crop en cada frame, `wgc_session.cpp:206-300`).
- Coste colateral: 4 procesos PowerShell/s mientras se graba una ventana (CPU + RAM + AV).

**Plan**: sustituir el polling PowerShell por un canal nativo persistente (extender `electron/native/cursor-monitor/src/main.cpp`, que ya vive como proceso hijo y emite líneas por stdout cada 50 ms) y actualizar los bounds a ~50-100 ms. Dejar PowerShell solo como fallback.

### 2.2 El relleno de huecos del encoder no tiene tope

- `electron/native/wgc-capture/src/mf_encoder.cpp:288-310` (`extendLastFrameToLocked`): mientras `nextSampleTime + frameDuration <= timestamp`, escribe un frame duplicado con `IMFSinkWriter::WriteSample`.
- Se invoca en cada frame (`writeFrame`) y al detener la grabación (`main.cpp:479`).
- Si el encoder se atrasa o la captura se congela, el bucle escribe cientos/miles de muestras en el hilo del callback de WGC. Con `WINDOWS_CAPTURE_STOP_TIMEOUT_MS = 45_000` (`electron/ipc/recording/windows.ts:22`) eso termina en `Timed out waiting for native Windows capture to stop` (#961) y grabaciones que no se pueden cerrar.
- Además, durante una pausa el video no escribe frames (`main.cpp:362`) y el audio se pausa desde el hilo principal con un polling de 20 ms (`main.cpp:422-433`): cada pausa deja un desfase audio/video de hasta ~20 ms que se acumula (#684, #1074).

**Plan**: acotar el relleno (por ejemplo máx. 2 s de duplicados por llamada; si el hueco es mayor, avanzar el timestamp sin escribir todas las muestras) y pausar/reanudar el audio en el mismo instante que el video (mover el pause/resume al hilo que atiende stdin, con el timestamp exacto).

### 2.3 La captura de ventana es un crop de la captura del monitor

- `wgc_session.cpp:181-196` (`initialize(HWND)`): crea el `GraphicsCaptureItem` del **monitor** (`createCaptureItemForMonitor`) y luego recorta a la ventana (`updateWindowCropRect`, `wgc_session.cpp:198-275`).
- Consecuencias conocidas: no aparecen menús clásicos Win32/popups fuera del rect, el cursor del sistema se desactiva (`IsCursorCaptureEnabled(false)`) y si la ventana se sale del monitor se recorta (`IntersectRect`).
- Esto explica varios reportes de ventana (#423, #634, #503) y es la razón por la que el cursor suave depende 100% de la telemetría.

**Plan**: evaluar migrar a item-level capture (`CreateForWindow` + `IncludeSecondaryWindows`) manteniendo el crop como fallback; mientras tanto, alinear exactamente el rect de crop con el rect usado para normalizar el cursor (misma fuente DWM, mismo instante).

### 2.4 El instalador empaqueta 19 MB de wallpapers inaccesibles

- `public/wallpapers` tiene 39 archivos (34,9 MB); `src/lib/wallpapers.ts` registra 25.
- `electron-builder.json5:46-51` copia la carpeta completa a `extraResources` → el instalador de Windows los incluye todos.
- Verificado: `lemonade.jpeg` (5,7 MB), `bluerays.jpeg` (3,1 MB), `wallpaper9.jpg` (2 MB), etc. no están referenciados.

**Plan**: borrar los 12 huérfanos y recomprimir el resto (WebP/AVIF, lado mayor 2560 px). Ganancia esperada: ~25-30 MB menos de instalador y menos I/O en export.

## 3. Backlog priorizado (Windows)

### P0 — Grabar sin fallar

| Issue | Síntoma | Estado del análisis |
|---|---|---|
| #961 | `Timed out waiting for native Windows capture to stop` | Causa raíz identificada (2.2) |
| #684 | Pause/resume congela o corrompe la grabación | Causa raíz identificada (2.2) |
| #393 | WGC no arranca → fallback con cursor desincronizado | Falta reproducir en esta máquina |
| #791 / #806 | Crash al iniciar (GPU/sandbox), queda solo el tray | Falta reproducir |
| #530 | El editor no abre al detener en Windows 11 | Falta reproducir |

### P1 — Que la ventana grabada se vea bien

| Issue | Síntoma | Estado |
|---|---|---|
| #503 | Cursor desplazado al grabar una ventana | Hipótesis 2.1 + falta reproducir |
| #634 | Cursor real + cursor suave duplicados (solo modo ventana) | Hipótesis 2.3 |
| #423 | Grabar una ventana graba toda la pantalla | El plumbing ya existe en `main`; verificar con build |
| #1106 | La ventana grabada (Edge) se congela al pausar | Falta reproducir |
| #889 | Cursor personalizado no aplica en modo ventana | Falta reproducir |

### P2 — Audio y export

| Issue | Síntoma |
|---|---|
| #982 / #1018 / #652 | Video con audio en origen, export sin audio |
| #779 / #736 | Micrófono se corta a los 30 s / audio en grabaciones largas |
| #1098 / #350 | Export falla o salen artefactos |
| #872 / #793 | Export GPU/CUDA falla y cae a compositor D3D11 |

### P3 — Rendimiento y tamaño (Windows)

1. Reemplazar el polling PowerShell por helper nativo (2.1).
2. Wallpapers: huérfanos + recompresión (2.4).
3. Revisar bitrate/fps por defecto del encoder nativo (`mf_encoder.cpp:16-33`): 60 fps fijos incluso para ventanas estáticas.
4. Revisar el coste de `Add-Type` en otras rutas Windows (`bringWindowsWindowForward`, etc.).

## 4. Fases

- **Fase 0 — Entorno**: `npm ci` + build nativo + `typecheck` + `vitest` en verde. Documentar requisitos.
- **Fase 1 — Estabilidad (P0)**: fixes con prueba automatizada cuando sea posible; prueba manual de grabación de 1-2 min pausando/reanudando y deteniendo.
- **Fase 2 — Ventana/cursor (P1)**: helper nativo de bounds + alineación de coordenadas.
- **Fase 3 — Audio/export (P2)**.
- **Fase 4 — Optimización (P3)**.

Cada fix va en su rama (`fix/...`) con commit convencional; `main` del fork se mantiene como espejo de upstream hasta que un fix esté verificado.

## 5. Estado de avance

### Rama `windows/stability-batch-1`

Verificado en esta máquina (Windows 11, VS 2026 BuildTools 18 + MSVC 14.51, Node 24.15):

| Cambio | Verificación |
|---|---|
| Build nativo en VS 2026 (fallback de toolset + macro de C++/WinRT) | `wgc-capture.exe` compila y se stagea |
| `build:whisper-runtime` con bsdtar | runtime de Whisper staged (whisper-cli + DLLs) |
| Tope de relleno de frames + audio alineado en pausa | `wgc-capture.exe` grabando 2 s + pausa 30 s + 2 s → 3,69 s de video, sin backlog |
| Bounds de ventana por helper nativo (sin PowerShell en bucle) | cursor fijo en el centro de una ventana 884x684 → `cx/cy = 0.5000` en 78 muestras; procesos PowerShell durante 4 s de grabación: ~16 → 0 |
| Suite de tests portable en Windows | 1607 passed / 38 skipped / 0 failed (antes: 9 failed) |
| `tsc --noEmit` | sin errores |
| `vite build` (renderer + main + preload) | OK |
| Grabación real de ventana con la app | mp4 884x684@60 + `.cursor.json`, stop correcto, sin fallback |

Pendiente de validación con la app real (GUI): overlay de cursor en el editor y el export (#503/#634), apertura del editor tras detener (#530) y export con audio (#982). El modal de bienvenida bloquea el editor cuando no hay Supabase configurado (build de desarrollo), así que esa parte hay que probarla con la build empaquetada o con una cuenta.

### Requisitos de build en Windows (verificados)

- Node 24.x + npm 12.
- Visual Studio 2026 (BuildTools o Community) con workload **Desarrollo para el escritorio con C++**. CMake y Ninja vienen incluidos en VS; si se ejecuta desde git-bash hay que agregar
  `.../Microsoft Visual Studio/18/BuildTools/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin` al `PATH` para `build:whisper-runtime`.
- Python 3.11 en `PATH` (node-gyp / electron-rebuild).
- `npm ci` puede fallar si el postinstall no encuentra CMake; en ese caso ejecutar `npm run rebuild:native` y `npm run build:platform-native-helpers` por separado.

