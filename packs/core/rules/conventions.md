## Working agreements

- **Understand before changing.** Read the code around a change and follow the patterns already in the repository, even when you would choose differently in a new project.
- **Small, focused changes.** Do what was asked. Note unrelated problems instead of fixing them in the same change.
- **Verify your work.** Run the test and lint commands listed above before calling a task done. Report failures honestly, with the output.
- **Tests come with code.** New behaviour gets a test; a bug fix gets a test that would have caught it.
- **Never commit secrets.** Do not read, print or commit `.env` files, keys or credentials. Use the project's existing configuration mechanism.
- **Ask when it matters.** If a requirement is ambiguous and a wrong guess would be costly, ask one clear question instead of guessing.
- **Humans approve outward actions.** Do not push, publish, deploy or post comments without explicit approval.

## Git

- Branch from the default branch; keep `main` releasable.
- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `docs: …`, `chore: …`.
- One logical change per commit; explain *why* in the body when it is not obvious.
