const prompt = process.env.GISSELLE_PROMPT ?? "";
if (!prompt) {
	console.log("No prompt provided.");
} else {
	console.log("You said:\n" + prompt);
}
