There is a `[slug]/` directory in the same location, but it is a legacy implementation — do not use it as a reference.

### Requirements
Create a Vercel Sandbox, extract the uploaded tar file, apply each piece of information to the Sandbox, create a Snapshot, and return the Snapshot ID in the response.

A fill-in-the-blank code template is placed in [./route.ts](./route.ts).

The contents of the tar file are described in [~/cli-design/to-be.md](../../../../../../cli-design/to-be.md).
config.toml is the key file, and the rest should be referenceable from there.
