import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import { getButtonClassName, type ButtonVariant } from "./styles/button-styles";

type ButtonLinkProps = ComponentPropsWithoutRef<typeof Link> & {
	variant?: ButtonVariant;
};

export function ButtonLink({
	className,
	variant = "default",
	...props
}: ButtonLinkProps) {
	return (
		<Link
			className={getButtonClassName({ className, variant })}
			{...props}
		/>
	);
}
