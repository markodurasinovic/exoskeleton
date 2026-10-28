# Third-party notices

exo runs pi. pi is installed as a dependency and is never vendored into this repository, but its licence travels with it.

## pi

- Upstream: <https://github.com/earendil-works/pi>
- Packages used: `@earendil-works/pi-coding-agent`, and its `@earendil-works/pi-*` dependencies
- Licence: MIT
- Copyright: Copyright (c) 2025 Mario Zechner

```
MIT License

Copyright (c) 2025 Mario Zechner

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Regenerating this file

This covers what exo depends on directly. If exo is ever distributed as a bundle, binary, or container, list the full transitive set:

```bash
npx license-checker --summary
```

and include every licence whose terms require attribution.
