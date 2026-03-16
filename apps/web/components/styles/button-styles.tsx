export type ButtonVariant = "default" | "solid";

type GetButtonClassNameParams = {
	className?: string;
	variant?: ButtonVariant;
};

const baseClassName =
	"inline-flex min-h-11 items-center justify-center rounded-xl border px-5 text-sm font-medium tracking-tight transition duration-150 sm:min-h-12 sm:px-6 sm:text-base";

const variantClassNames = {
	default:
		"border-white/14 bg-white/5 text-text hover:border-white/20 hover:bg-white/10",
	solid:
		"border-transparent bg-button-solid-background text-button-solid-foreground hover:bg-white",
} satisfies Record<ButtonVariant, string>;

export function getButtonClassName({
	className,
	variant = "default",
}: GetButtonClassNameParams) {
	return [baseClassName, variantClassNames[variant], className]
		.filter(Boolean)
		.join(" ");
}
