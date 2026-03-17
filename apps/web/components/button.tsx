import type { ButtonHTMLAttributes } from "react";
import { type ButtonVariant, getButtonClassName } from "./styles/button-styles";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: ButtonVariant;
};

export function Button({
	className,
	type = "button",
	variant = "default",
	...props
}: ButtonProps) {
	return (
		<button
			type={type}
			className={getButtonClassName({ className, variant })}
			{...props}
		/>
	);
}
