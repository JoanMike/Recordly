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

### Modal de bienvenida (hecho)

Se eliminó `OnboardingController`, el modo onboarding de `RecordlySignInDialog` (`OnboardingLayout`, `OnboardingPermissions`, `PermissionsConfetti`) y la fila "Show onboarding" de Ajustes. La app abre directo en el dashboard, sin registro; verificado con captura de la build empaquetada.

### Superficies de cuenta y nube (hecho)

Se eliminaron del producto local: sección "Shared" del dashboard, botón "Sign in" del pie del sidebar, avatar "Recordly account" del sidebar del editor, y las categorías "Account" y "Advanced" de Ajustes (con el panel de cuenta y el interruptor de actualizaciones experimentales). `tsc` limpio, 1607 tests OK.

### Grabar no hacía nada (hecho, causa raíz)

Tras quitar el login, pulsar "Grabar" cerraba el HUD y dejaba el editor delante sin grabar. Causa: `preparePermissions()` en `useScreenRecorder.ts` exigía sesión de Supabase; sin sesión llamaba a `showRecordingPermissions()`, que oculta el HUD (`recordingNavigation.open(false)`) y emite `recording-permissions-requested`, un evento que ya no escucha nadie. Además `prepareRecordingStart()` usaba el mismo gate, así que tampoco arrancaba con una fuente ya elegida.
Ahora el gate es el permiso real del SO: Windows no necesita ninguno y macOS mantiene los chequeos de pantalla/accesibilidad.
Verificado de punta a punta en la build empaquetada: Grabar sin fuente → selector de ventanas → elegir ventana → Grabar → cuenta atrás 3 s → cronómetro en el HUD → Detener → editor con el mp4 (1920x1032, 47,58 s, 19 MB).

### Empaquetado en Windows (hecho)

- `npm run build:win` produce `release/Recordly-windows-x64.exe` (179 MB) y `release/win-unpacked`.
- **Trampa**: electron-builder descarga `winCodeSign`, cuyo 7z contiene symlinks de macOS (`darwin/10.12/lib/*.dylib`). Sin Modo desarrollador/administrador, 7za falla con `Cannot create symbolic link ... privilegio requerido` y el build aborta en el paso de firma.
- Workaround usado: `npx electron-builder --win nsis -c.win.signAndEditExecutable=false`. Genera el instalador, pero sin edición de icono/versión del .exe.
- Arreglo definitivo para el usuario: activar Modo desarrollador (Configuración → Sistema → Para programadores) o correr la terminal como administrador, y volver a `npm run build:win`.

### Cortes de silencio en el audio (hecho)

Con un buffer de motor de 20 ms, el hilo de WASAPI perdía paquetes cada vez que el codificador lo dejaba sin CPU: cada pérdida se rellenaba con silencio y se oía como un corte seco (medido en una grabación real de 25 s: 10 huecos de 70-90 ms, `gapFillCount=10`, `insertedSilenceFrames=37345`).
Ahora el buffer se pide a 500 ms y el hilo drena cada ≤10 ms. Misma prueba de 25 s: `gapFillCount=0`, `insertedSilenceFrames=0`, `dataDiscontinuityCount` 13 → 1 y ni un hueco en el WAV.

### Desfase de audio (mitigado)

El "warm start" de Windows arrancaba la captura, la pausaba para la cuenta atrás y la reanudaba: el hueco de la pausa quedaba dentro del sidecar `.system.wav` (3,2 s de `startDelayMs` o 3,14 s de silencio insertado al inicio), que es exactamente el retraso audible.
Ahora Windows ya no hace warm start (solo macOS): la captura arranca cuando termina la cuenta atrás. Medido en la build empaquetada: `startDelayMs` 3203 → 1011 y silencio insertado 150868 → 7008 frames (0,15 s). El ~1 s restante es el arranque del dispositivo WASAPI; queda pendiente afinarlo si sigue molesto.

### #982 — export con audio (resuelto por la vía del sidecar)

La grabación deja el audio en sidecars `.system.wav` / `.mic.wav` y el export los mezcla; el síntoma "sale mudo" que se reportaba era en realidad el audio perdido en captura (ver cortes de silencio) más el desfase del warm start. Con ambos corregidos, el export lleva el audio del sidecar.

### #736 — grabaciones largas (verificado)

Prueba de 25 minutos (1500 s) a 1920x1080@60 con música en reproducción continua, usando el mismo helper nativo:

| Métrica | Resultado |
|---|---|
| Vídeo | 1499,61 s |
| Audio | 1499,64 s (Δ 33 ms en 25 min) |
| `gapFillCount` | 1 |
| `insertedSilenceFrames` | 16 400 (0,34 s en total) |
| `dataDiscontinuityCount` | 1 |

Los silencios que detecta `silencedetect` son pausas de 1,4-2,3 s entre canciones, no huecos digitales. Antes del arreglo del buffer, 25 s ya producían 6-10 huecos; ahora 25 min producen uno.

### #508 — esquinas redondeadas en el export (no aplica)

Con Radius ≈ 40 % en el editor, el MP4 exportado (1920x1080@60, 28,2 s) sí sale con las esquinas redondeadas: verificado sobre un frame del archivo del usuario, ampliando la esquina superior izquierda (curva continua, no ángulo recto). El radio se calcula con `scalePreviewBorderRadius` sobre el tamaño de salida y el exportador nativo lo recibe en píxeles, así que preview y export coinciden. Se cierra como no reproducible en esta versión.

### #657 — el HUD bloqueaba los clics (hecho)

La ventana del HUD cubre toda el área de trabajo. Ahora el renderer reporta el rect de la barra y el proceso principal sondea el cursor: click-through en el resto del escritorio, interactiva solo sobre la barra. Verificado con ratón real (`WS_EX_TRANSPARENT` alterna y "Detener" responde).

### #634 — cursor duplicado en el fallback (hecho)

Si la captura cae al fallback del navegador, el cursor va quemado en el video. Ahora el renderer marca ese caso y el proceso principal **no escribe** el `.cursor.json`, así que el editor y el exportador no pueden dibujar un segundo cursor.


### Requisitos de build en Windows (verificados)

- Node 24.x + npm 12.
- Visual Studio 2026 (BuildTools o Community) con workload **Desarrollo para el escritorio con C++**. CMake y Ninja vienen incluidos en VS; si se ejecuta desde git-bash hay que agregar
  `.../Microsoft Visual Studio/18/BuildTools/Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin` al `PATH` para `build:whisper-runtime`.
- Python 3.11 en `PATH` (node-gyp / electron-rebuild).
- `npm ci` puede fallar si el postinstall no encuentra CMake; en ese caso ejecutar `npm run rebuild:native` y `npm run build:platform-native-helpers` por separado.

