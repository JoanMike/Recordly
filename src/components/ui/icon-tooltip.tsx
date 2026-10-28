import { Tooltip } from "@heroui/react";
import type { ReactElement } from "react";

/**
 * Icon-only controls are unreadable without a hint, and the native `title`
 * tooltip takes about a second to appear. This keeps the accessible name and the
 * visible tooltip in sync from a single label.
 */
export function IconTooltip({
	label,
	placement = "bottom",
	children,
}: {
	label: string;
	placement?: "top" | "bottom" | "left" | "right";
	children: ReactElement;
}) {
	if (!label) return children;
	return (
		<Tooltip>
			<Tooltip.Trigger>{children}</Tooltip.Trigger>
			<Tooltip.Content placement={placement}>{label}</Tooltip.Content>
		</Tooltip>
	);
}
