# Document appearance step

Run this step during full and quick onboarding, after citation style and before the style fingerprint. It sets `outputFormatPreferences.stylePackage`.

Ask the researcher (numbered list):

> "How should exported documents look?"
>
> 1. **Shipped default** — No style package; exports keep the built-in appearance. Leave `stylePackage` unset.
> 2. **Start from the academic-default starter** — Copy the starter into `.pi-academic/styles/academic-default/` and edit it later.
> 3. **Register an existing package** — Use a package already under `.pi-academic/styles/<name>/`.

Wait for the reply; accept the option number, label, or a close paraphrase.

## Option 2: copy the starter

Call `pi_academic_style_package` with `action: "install-starter"`. The tool copies the packaged starter (`design.json` plus any native starter assets) into `.pi-academic/styles/academic-default/`. It refuses to overwrite an existing package: if `.pi-academic/styles/academic-default/` already exists, report that and offer option 3 instead.

## Option 3: register an existing package

Call `pi_academic_style_package` with `action: "list"` and ask which package to use. If none exist, say so and offer options 1 or 2.

## Validate before saving (options 2 and 3)

Call `pi_academic_style_package` with `action: "validate"` and `package: <name>`. It checks the version-1 `design.json`, a matching `name`, property values, and that every referenced native asset exists inside the package, for all of `docx`, `odt`, `latex`, and `pdf`. Show every returned error and warning verbatim. If validation fails, do not save `stylePackage`; ask the researcher to fix the package or pick another option. Never fall back silently.

After validation succeeds, save `outputFormatPreferences.stylePackage: "<name>"` with the rest of the profile.
