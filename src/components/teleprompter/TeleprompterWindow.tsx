import { Pause, Play, TextAa, X } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState } from "react";

type Settings = { text: string; speed: number; fontSize: number };

const DEFAULT_SETTINGS: Settings = { text: "", speed: 60, fontSize: 44 };

export function TeleprompterWindow() {
	const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
	const [loaded, setLoaded] = useState(false);
	const [editing, setEditing] = useState(true);
	const [playing, setPlaying] = useState(false);
	const [offset, setOffset] = useState(0);
	const scrollRef = useRef<HTMLDivElement>(null);
	const contentRef = useRef<HTMLDivElement>(null);
	const offsetRef = useRef(0);
	const frameRef = useRef<number | null>(null);

	useEffect(() => {
		void window.electronAPI?.getTeleprompter?.().then((result) => {
			if (result?.success) {
				setSettings(result.settings);
				setEditing(!result.settings.text.trim());
			}
			setLoaded(true);
		});
	}, []);

	const persist = useCallback((patch: Partial<Settings>) => {
		setSettings((current) => ({ ...current, ...patch }));
		void window.electronAPI?.setTeleprompter?.(patch);
	}, []);

	// Scroll only while playing; the offset lives in a ref so the animation does
	// not restart on every render.
	useEffect(() => {
		if (!playing || editing) return;
		let last = performance.now();
		const step = (now: number) => {
			const delta = (now - last) / 1000;
			last = now;
			const viewport = scrollRef.current?.clientHeight ?? 0;
			const content = contentRef.current?.scrollHeight ?? 0;
			const max = Math.max(0, content - viewport * 0.25);
			offsetRef.current = Math.min(max, offsetRef.current + settings.speed * delta);
			setOffset(offsetRef.current);
			if (offsetRef.current >= max) {
				setPlaying(false);
				return;
			}
			frameRef.current = requestAnimationFrame(step);
		};
		frameRef.current = requestAnimationFrame(step);
		return () => {
			if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
			frameRef.current = null;
		};
	}, [playing, editing, settings.speed]);

	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (editing) return;
			if (event.code === "Space") {
				event.preventDefault();
				setPlaying((value) => !value);
			}
			if (event.key === "Escape") window.electronAPI?.closeTeleprompter?.();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [editing]);

	const restart = () => {
		offsetRef.current = 0;
		setOffset(0);
	};

	return (
		<div className="flex h-screen w-screen flex-col overflow-hidden rounded-xl border border-white/15 bg-black/70 text-white backdrop-blur-sm">
			<div
				className="flex select-none items-center gap-1 border-b border-white/10 px-2 py-1"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				<span className="mr-auto pl-1 text-[11px] font-medium text-white/70">
					Teleprompter
				</span>
				<div
					className="flex items-center gap-1"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<button
						type="button"
						className="rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => {
							setPlaying(false);
							restart();
						}}
						title="Volver al inicio"
					>
						⤒
					</button>
					<button
						type="button"
						className="rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => persist({ speed: Math.max(10, settings.speed - 10) })}
						title="Más lento"
					>
						−
					</button>
					<span className="w-12 text-center text-[10px] tabular-nums text-white/60">
						{settings.speed} px/s
					</span>
					<button
						type="button"
						className="rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => persist({ speed: Math.min(300, settings.speed + 10) })}
						title="Más rápido"
					>
						+
					</button>
					<button
						type="button"
						className="rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => persist({ fontSize: Math.max(16, settings.fontSize - 4) })}
						title="Texto más pequeño"
					>
						A−
					</button>
					<button
						type="button"
						className="rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => persist({ fontSize: Math.min(120, settings.fontSize + 4) })}
						title="Texto más grande"
					>
						A+
					</button>
					<button
						type="button"
						className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-white/80 hover:bg-white/10"
						onClick={() => {
							setPlaying(false);
							setEditing((value) => !value);
						}}
						title={editing ? "Empezar a leer" : "Editar el texto"}
					>
						<TextAa className="size-3.5" />
						{editing ? "Listo" : "Editar"}
					</button>
					<button
						type="button"
						className="rounded p-1 text-white/70 hover:bg-white/10"
						aria-label="Cerrar el teleprompter"
						onClick={() => window.electronAPI?.closeTeleprompter?.()}
					>
						<X className="size-3.5" />
					</button>
				</div>
			</div>

			{editing ? (
				<textarea
					className="min-h-0 flex-1 resize-none bg-transparent p-4 text-sm leading-relaxed text-white outline-none"
					placeholder="Pega aquí el guion. Pulsa «Listo» para empezar a leer."
					value={settings.text}
					onChange={(event) => persist({ text: event.target.value })}
					autoFocus
				/>
			) : (
				<>
					<div ref={scrollRef} className="relative min-h-0 flex-1 overflow-hidden px-6">
						<div
							ref={contentRef}
							style={{
								transform: `translateY(-${offset}px)`,
								fontSize: `${settings.fontSize}px`,
								lineHeight: 1.35,
							}}
							className="whitespace-pre-wrap pt-2 font-semibold tracking-tight"
						>
							{settings.text}
						</div>
					</div>
					<div className="flex items-center justify-center gap-3 border-t border-white/10 py-1.5">
						<button
							type="button"
							className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-medium hover:bg-white/25"
							onClick={() => setPlaying((value) => !value)}
						>
							{playing ? (
								<Pause className="size-3" weight="fill" />
							) : (
								<Play className="size-3" weight="fill" />
							)}
							{playing ? "Pausar" : "Desplazar"}
						</button>
						<span className="text-[10px] text-white/40">
							Espacio para desplazar · Esc para cerrar
						</span>
					</div>
				</>
			)}
			{!loaded && <span className="sr-only">Cargando</span>}
		</div>
	);
}
