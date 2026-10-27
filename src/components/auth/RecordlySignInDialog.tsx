import { GithubLogo } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useI18n } from "@/contexts/I18nContext";
import { SignOut } from "@/components/ui/icons";
import type { User } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState, useRef } from "react";
import {
	Modal,
	Button,
	Form,
	TextField,
	Input,
	Label,
	Description,
	FieldError,
	Separator,
	Alert,
} from "@heroui/react";
import {
	getEnabledSignInProviders,
	type RecordlyOAuthProvider,
	sendSignInLink,
	signInWithSocial,
	signOutRecordly,
} from "@/lib/auth/recordlyAuth";

const MotionDialog = motion.create(Modal.Dialog);

export type SignInReason = "account" | "share";

type Props = {
	variant?: "compact" | "wide";
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reason?: SignInReason;
	user: User | null;
	configured: boolean;
	callbackError?: string;
	onAuthenticated: () => void;
};

function friendlyAuthError(
	error: unknown,
	action: string,
	t: ReturnType<typeof useI18n>["t"],
): string {
	const message = error instanceof Error ? error.message : String(error);
	if (/unsupported provider|provider is not enabled/i.test(message)) {
		if (action === "google") {
			return t("editor.cloud.googleUnavailable");
		}
		if (action === "azure") return "Microsoft sign-in is not available yet.";
		if (action === "github") return "GitHub sign-in is not available yet.";
		return t("editor.cloud.providerUnavailable");
	}
	return message;
}

export function RecordlySignInDialog({
	variant = "compact",
	open,
	onOpenChange,
	user,
	configured,
	callbackError,
	onAuthenticated,
}: Props) {
	const { t } = useI18n();
	const awaitingSignIn = useRef(false);
	const wide = variant === "wide";
	const [email, setEmail] = useState("");
	const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
	const [busy, setBusy] = useState<string>();
	const [message, setMessage] = useState<string>();
	const [linkSent, setLinkSent] = useState(false);
	const [providers, setProviders] = useState<RecordlyOAuthProvider[]>([]);
	const [loadingProviders, setLoadingProviders] = useState(false);

	useEffect(() => {
		if (!open || !configured || user) return;
		let disposed = false;
		const controller = new AbortController();
		const timeout = window.setTimeout(() => controller.abort(), 10000);
		setLoadingProviders(true);
		setProviders([]);
		void getEnabledSignInProviders(controller.signal)
			.then((enabled) => {
				if (!controller.signal.aborted) setProviders(enabled);
			})
			.catch(() => {
				// Email remains available to retry when provider discovery cannot reach Auth.
			})
			.finally(() => {
				window.clearTimeout(timeout);
				if (!disposed) setLoadingProviders(false);
			});
		return () => {
			disposed = true;
			window.clearTimeout(timeout);
			controller.abort();
		};
	}, [open, configured, user]);

	useEffect(() => {
		if (open && callbackError) {
			setMessage(callbackError);
			setLinkSent(false);
		}
	}, [open, callbackError]);

	useEffect(() => {
		if (!open) {
			awaitingSignIn.current = false;
			setBusy(undefined);
			setMessage(undefined);
			setLinkSent(false);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (!user) awaitingSignIn.current = true;
		else if (awaitingSignIn.current) {
			awaitingSignIn.current = false;
			setMessage(undefined);
			onAuthenticated();
		}
	}, [open, user, onAuthenticated]);

	const run = async (label: string, action: () => Promise<unknown>) => {
		setBusy(label);
		setMessage(undefined);
		setLinkSent(false);
		try {
			await action();
		} catch (error) {
			setMessage(friendlyAuthError(error, label, t));
		} finally {
			setBusy(undefined);
		}
	};

	const submitEmail = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!configured || busy) return;
		emailSignInLink();
	};

	const emailSignInLink = () => {
		if (!validEmail) {
			setMessage(t("editor.cloud.enterEmail"));
			return;
		}
		void run("link", async () => {
			await sendSignInLink(email.trim());
			setMessage(
				"Check your inbox to verify your email and continue to Recordly. Open the link on this computer with Recordly running.",
			);
			setLinkSent(true);
		});
	};

	const reduceMotion = useReducedMotion();
	const transition = { duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] as const };
	const reveal = {
		initial: { opacity: 0, y: reduceMotion ? 0 : 10 },
		animate: { opacity: 1, y: 0 },
		transition,
	};
	const disabled = Boolean(busy);
	const artwork = `${import.meta.env.BASE_URL}auth/login-banner.png`;
	const signInContent = (
		<motion.div
			layout="position"
			transition={transition}
			className={`flex flex-1 flex-col justify-center px-5 py-6 sm:px-8 ${wide ? "md:order-1 md:min-w-0" : ""}`}
		>
			<div className="w-full max-w-[420px] self-center space-y-4 @container">
				<motion.div {...reveal}>
					<Modal.Header className="items-center gap-3 text-center">
						<div className="flex items-center gap-3" aria-label="Recordly">
							<img
								src={`${import.meta.env.BASE_URL}app-icons/recordly-128.png`}
								alt=""
								className="size-12 rounded-xl"
							/>
							<span className="text-3xl font-semibold tracking-tight">Recordly</span>
						</div>
						<Modal.Heading className="whitespace-nowrap text-[clamp(12px,5cqw,22px)] font-semibold leading-tight tracking-tight">
							{user ? "Your account" : "Beautiful, shareable screen recordings"}
						</Modal.Heading>
						<Description className="text-sm">
							{user ? user.email : "Sign in to get started"}
						</Description>
					</Modal.Header>
				</motion.div>
				{user ? (
					<Button
						variant="secondary"
						className="w-full"
						isDisabled={disabled}
						onPress={() =>
							void run("signout", async () => {
								await signOutRecordly();
								onOpenChange(false);
							})
						}
					>
						<SignOut className="size-4" />
						{busy === "signout"
							? t("editor.cloud.signingOut")
							: t("editor.cloud.signOut")}
					</Button>
				) : (
					<>
						{loadingProviders ? (
							<div
								role="status"
								aria-label="Loading sign-in options"
								className="h-11 rounded-xl bg-surface-secondary"
							/>
						) : providers.length > 0 ? (
							<motion.div
								{...reveal}
								transition={{
									...transition,
									delay: reduceMotion ? 0 : 0.05,
								}}
								className="flex gap-2"
							>
								{(
									[
										{
											provider: "google",
											label: "Google",
											image: "google-logo.png",
										},
										{
											provider: "azure",
											label: "Microsoft",
											image: "microsoft-logo.svg",
										},
										{
											provider: "github",
											label: "GitHub",
											image: null,
										},
									] as const
								)
									.filter(({ provider }) => providers.includes(provider))
									.map(({ provider, label, image }) => (
										<Button
											key={provider}
											variant="secondary"
											aria-label={`Continue with ${label}`}
											className="h-11 w-full min-w-0 gap-2 rounded-xl px-2 text-xs font-medium text-foreground @[360px]:text-sm"
											isDisabled={disabled || !configured}
											onPress={() =>
												void run(provider, () => signInWithSocial(provider))
											}
										>
											{image ? (
												<img
													src={`${import.meta.env.BASE_URL}auth/${image}`}
													alt=""
													className="size-4 shrink-0"
												/>
											) : (
												<GithubLogo
													aria-hidden="true"
													weight="fill"
													className="size-4 shrink-0"
												/>
											)}
											{label}
										</Button>
									))}
							</motion.div>
						) : null}
						{(loadingProviders || providers.length > 0) && (
							<div className="flex items-center gap-4">
								<Separator className="flex-1" />
								<span className="text-xs text-muted">or continue with email</span>
								<Separator className="flex-1" />
							</div>
						)}
						<Form className="flex flex-col" onSubmit={submitEmail}>
							<TextField
								name="email"
								type="email"
								value={email}
								onChange={(value) => {
									setEmail(value);
									setLinkSent(false);
									setMessage(undefined);
								}}
								isRequired
								isDisabled={disabled}
							>
								<Label>Email</Label>
								<Input
									className="h-12"
									placeholder="you@example.com"
									autoComplete="email"
								/>
								<FieldError />
							</TextField>
							<AnimatePresence initial={false}>
								{validEmail && (
									<motion.div
										key="magic-link"
										initial={{
											height: 0,
											opacity: 0,
											y: reduceMotion ? 0 : -6,
										}}
										animate={{ height: "auto", opacity: 1, y: 0 }}
										exit={{
											height: 0,
											opacity: 0,
											y: reduceMotion ? 0 : -6,
										}}
										transition={transition}
										className="w-full overflow-hidden"
									>
										<Button
											type="submit"
											variant="primary"
											className="mt-3 h-12 w-full"
											isDisabled={disabled || !configured}
										>
											{busy === "link"
												? "Sending sign-in link…"
												: "Email me a magic link"}
										</Button>
									</motion.div>
								)}
							</AnimatePresence>
						</Form>
					</>
				)}
				{message ? (
					<Alert status={linkSent ? "success" : "danger"}>
						<Alert.Indicator />
						<Alert.Content>
							<Alert.Description>{message}</Alert.Description>
						</Alert.Content>
					</Alert>
				) : null}
				{!configured && !user && (
					<Description role="status">{t("editor.cloud.unavailable")}</Description>
				)}
			</div>
		</motion.div>
	);
	return (
		<Modal isOpen={open} onOpenChange={onOpenChange}>
			<Modal.Backdrop>
				<Modal.Container size="cover" placement="center" className="p-4 sm:p-8">
					<MotionDialog
						layout
						transition={transition}
						className={`h-auto min-h-0 w-full max-h-[calc(100dvh-48px)] gap-0 overflow-y-auto rounded-[32px] p-2 ${wide ? "max-w-[1120px] md:grid md:grid-cols-2 md:aspect-[28/19]" : "max-w-[600px]"}`}
					>
						<div
							className={`relative shrink-0 overflow-hidden rounded-[24px] h-32 sm:h-36 ${wide ? "md:order-2 md:h-full md:min-h-0" : ""}`}
						>
							<img
								src={
									wide
										? `${import.meta.env.BASE_URL}auth/login-side.png`
										: artwork
								}
								alt=""
								className="absolute inset-0 size-full object-cover object-center"
							/>
						</div>
						{signInContent}
						<Modal.CloseTrigger
							aria-label={t("common.actions.close")}
							className="z-20"
						/>
					</MotionDialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
