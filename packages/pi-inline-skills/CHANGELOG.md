# @tifan/pi-inline-skills

## 1.0.5

### Patch Changes

- [`3774007`](https://github.com/tifandotme/pi-extensions/commit/37740077983cfd5d6f7f5888de04ac3f2b0ed84e) Thanks [@tifandotme](https://github.com/tifandotme)! - Keep slash skill tokens unchanged in submitted prompts and restore loaded skills from the current session branch so rewound prompts inject the right skill content.

## 1.0.4

### Patch Changes

- [`8d3f053`](https://github.com/tifandotme/pi-extensions/commit/8d3f053f9b57110111fbdae696bb978fbc162dd0) Thanks [@tifandotme](https://github.com/tifandotme)! - Load inline skill content directly so hidden skills work and rendered skill blocks match Pi's native skill display.

## 1.0.3

### Patch Changes

- [`f0090c2`](https://github.com/tifandotme/pi-extensions/commit/f0090c2a5c648febc7281f88c25634414af22b99) Thanks [@tifandotme](https://github.com/tifandotme)! - Use Pi 0.78.1's new system prompt options API so `/loaded-skills` reports skills from Pi's loaded prompt context.

## 1.0.2

### Patch Changes

- [`b3234aa`](https://github.com/tifandotme/pi-extensions/commit/b3234aac76ab64bff8aa3e6593d97da25f573fd5) Thanks [@tifandotme](https://github.com/tifandotme)! - Show registered slash commands alongside matching inline skills so commands such as `/handoff-session` are not hidden by similarly named skills at the start of a prompt.

## 1.0.1

### Patch Changes

- [`e423080`](https://github.com/tifandotme/pi-extensions/commit/e423080556de1aa783efa62179fa7f3cea37812a) Thanks [@tifandotme](https://github.com/tifandotme)! - Fix slash skill completions so they replace only the typed skill query and keep the leading slash in place.

## 1.0.0

### Major Changes

- [`e9807bc`](https://github.com/tifandotme/pi-extensions/commit/e9807bcb6f519a48fb11bccec3f6652d8e02caeb) Thanks [@tifandotme](https://github.com/tifandotme)! - Switch inline skill tokens from `$skill` to `/skill`, including prompts that start with an inline skill, while preserving registered pi slash commands.

### Patch Changes

- [`65d8fe1`](https://github.com/tifandotme/pi-extensions/commit/65d8fe1cd639b8dcf1f55919ebbeff0c781a5ebd) Thanks [@tifandotme](https://github.com/tifandotme)! - Improve README with updated usage details and screenshots.

- [`f343acd`](https://github.com/tifandotme/pi-extensions/commit/f343acdb1f3a531832ad15aca1ad280f9c49f1e4) Thanks [@tifandotme](https://github.com/tifandotme)! - Show inline skill autocomplete entries with Pi-style `skill:` labels and source tags.

## 0.1.1

### Patch Changes

- [`8128641`](https://github.com/tifandotme/pi-extensions/commit/8128641df92aac2050dfedc1f92c14f9a7d4c848) Thanks [@tifandotme](https://github.com/tifandotme)! - fix lint errors

- [`48e1167`](https://github.com/tifandotme/pi-extensions/commit/48e11674378fd22b74a319d8fd3ce6c7919e47df) Thanks [@tifandotme](https://github.com/tifandotme)! - update readme, fix type error in inline-skills package

## 0.1.0

### Minor Changes

- [`de412e0`](https://github.com/tifandotme/pi-extensions/commit/de412e0957517c926c69962fe7ccef36495491e5) Thanks [@tifandotme](https://github.com/tifandotme)! - initial release
