# Recordly Local

**Grabador y editor de pantalla para Windows, sin cuenta y sin nube.**

Recordly Local es un fork de [Recordly](https://github.com/webadderallorg/Recordly) (AGPL-3.0) orientado a un caso concreto: **grabar y editar en tu propio PC, en Windows, sin registrarte, sin subir nada y sin depender de servicios externos.**

> Estado actual: **v2.0.0** · Windows 10/11 x64

---

## Qué cambia respecto del proyecto original

El código base es el de `webadderallorg/Recordly`. Sobre esa base, este fork:

### Se quitó todo lo que pedía cuenta

| Eliminado | Motivo |
|---|---|
| Onboarding y modal de bienvenida | Bloqueaba el editor sin Supabase configurado |
| "Sign in" del dashboard y del editor | No se usa ninguna cuenta |
| Sección "Shared" y publicación por enlace | Subir videos requería sesión |
| Ajustes de cuenta y de actualizaciones experimentales | Sin nube ni cuenta, no aportan |
| Función "Feedback" completa | Enviaba diagnósticos a un servicio externo |

### Correcciones pensadas para Windows

| Arreglo | Qué pasaba antes |
|---|---|
| **Grabación bloqueada sin sesión** | Con Supabase sin configurar, pulsar *Grabar* abría el editor y no grababa nada |
| **HUD click-through** | La barra cubría toda la pantalla y se tragaba los clics de la app grabada |
| **Arrastre de la barra** | Se detenía a los pocos centímetros y había que volver a agarrarla |
| **Cursor duplicado** | En el modo de respaldo el cursor salía quemado en el video *y* dibujado por el editor |
| **Deriva de audio en pausas** | Pausar y reanudar desincronizaba el audio respecto del video |
| **Grabación muda / desfasada** | El inicio en caliente metía la cuenta atrás dentro del audio |
| **Nombres con acentos** | Una ruta con `ñ` o acentos rompía la captura (`0x80070003`) |
| **Overlays en el selector** | "Escritorio completo" aparecía con el nombre de un overlay invisible |
| **Grabación perdida al crashear** | Si el renderer de la barra moría, la toma se perdía |
| **Temporales huérfanos** | Archivos `recordly-native-*` se acumulaban en `%TEMP%` |
| **Selector de ventanas lento** | Se lanzaba PowerShell con `Add-Type` en cada apertura (~500 ms) |
| **Preview con tironeo** | El audio apilaba decenas de *seeks* por segundo |

### Añadidos

- **Atajos globales** (opcionales): iniciar/detener y pausar sin enfocar la app.
- **Auto-stop** por minutos y **aviso de poco espacio en disco**.
- **Gestión de almacenamiento**: cuánto ocupan las grabaciones, abrir la carpeta y borrar lotes antiguos.
- **Teleprompter** en ventana aparte, con velocidad y tamaño configurables.
- **Atajos de editor configurables**: deshacer, rehacer, inicio/fin y zoom de línea de tiempo.
- **Tooltips** en todos los botones que solo mostraban un icono.
- **Nombres claros** en el selector de proporción (YouTube, Reels, cuadrado, retrato…).
- Instalador más liviano (se quitaron ~19 MB de fondos sin usar).

---

## Requisitos

- Windows 10 u 11, 64 bits.
- No hace falta cuenta ni conexión a internet para grabar y editar.

## Instalación

1. Descarga el instalador desde la sección **[Releases](../../releases)**.
2. Ejecuta `Recordly-Local-2.0.0-windows-x64.exe`.
3. Windows SmartScreen puede avisar que el archivo no está firmado: *Más información → Ejecutar de todas formas*. Este fork no tiene certificado de firma de código.

## Uso rápido

1. Abre **Recordly Local**; la barra de grabación aparece abajo.
2. **Pick screen** → elige una ventana o el escritorio completo.
3. **Grabar** (o `Ctrl+Alt+R` si activaste los atajos globales).
4. **Detener** → se abre el editor: recorta, añade zooms, anotaciones, subtítulos automáticos y exporta.

Los videos se guardan en la carpeta de grabaciones que elijas en Ajustes.

## Compilar desde el código

```bash
npm ci
npm run rebuild:native
npm run build:platform-native-helpers
npm run build:win
```

Requiere **Node 24+**, **Visual Studio Build Tools** (MSVC + CMake + Ninja) y Python 3.11.

Notas de Windows:

- Compila los helpers nativos en primer plano; si `postinstall` falla, ejecuta `rebuild:native` y `build:platform-native-helpers` por separado.
- Para un instalador **con icono y versión propios** hay que tener activado el Modo desarrollador de Windows (electron-builder extrae enlaces simbólicos del paquete de firma). Sin él:
  `npx electron-builder --win nsis -c.win.signAndEditExecutable=false`

## Limitaciones conocidas

- **Sin nube ni cuentas**: no hay publicación por enlace ni biblioteca compartida.
- **Sin firma de código**: SmartScreen avisará la primera vez.
- **4K**: el preview no usa proxies; en grabaciones 4K/60 el editor puede ir a tirones.
- **Audio**: la normalización de volumen, el antirruido y el *ducking* todavía no están implementados.
- **Export**: no se puede reanudar si cierras la app a mitad.

## Créditos y licencia

Este proyecto es un fork de **[Recordly](https://github.com/webadderallorg/Recordly)**, creado por sus autores originales. Todo el mérito del diseño y de la base del editor es suyo.

Se distribuye bajo **AGPL-3.0**, igual que el proyecto original. Las modificaciones de este fork son públicas en este repositorio, tal como exige la licencia. Consulta [LICENSE.md](LICENSE.md).

Los cambios respecto del original están documentados en [docs/WINDOWS_BACKLOG.md](docs/WINDOWS_BACKLOG.md).
