# Frontend structure

Rim & Rally uses Next.js 16 App Router with React and JavaScript/JSX. The `@/`
alias still points to `src/`. This organization changes file locations and imports,
not routes, component behavior, styling, payment rules or backend connections.

```text
src/
├── app/                         # Next.js pages, layouts, API routes and route states
│   ├── api/[...path]/
│   ├── book/[facilityId]/
│   ├── booking/[bookingId]/confirmation/
│   ├── dashboard/
│   ├── facilities/[facilityId]/
│   ├── join/
│   ├── login/
│   ├── globals.css
│   └── layout.jsx
├── assets/images/logo.jpg       # Assets imported by source modules
├── components/
│   ├── layout/                  # Brand, site header/footer and mobile navigation
│   └── ui/                      # Shared primitives, notices and availability messages
├── config/backend.js            # Shared backend availability flag
├── features/
│   ├── home/landing-sections.jsx
│   ├── booking/                 # Court/session selection, holds and guest details
│   ├── checkout/                # Payment screens, contract and digital passes
│   └── staff/                   # Staff forms, server actions and booking presentation
├── mocks/                       # Explicit demo fixtures and browser demo engines
├── server/                      # Server-only Django client, session checks and staff reads
└── services/
    ├── booking/                 # Scheduling and hold services
    ├── facilities/              # Facility discovery service
    ├── http/                    # Shared browser HTTP transport/error handling
    └── payments/                # Payment operations and response validation

public/
├── fonts/                       # Existing public font URLs and license files
└── images/                      # Existing public image URLs

tests/
├── *.test.js / *.test.jsx        # Current small unit/component/service test suite
├── setup.js
├── e2e/                         # Existing browser/demo tests
├── integration/                 # Live local Django connection + navigation/assets
├── staff/
└── admin/
```

## Where to add code

- **Pages and API endpoints:** use `src/app` and Next.js file names such as
  `page.jsx`, `layout.jsx`, `loading.jsx`, `error.jsx`, and `route.js`. Folders here
  determine public URLs. All existing route locations were retained.
- **Feature UI and behavior:** use the appropriate folder under `src/features`.
  Booking, checkout and staff already had useful boundaries and remain together.
  Add another feature folder when a new part of the product needs one.
- **Shared interface components:** use `components/ui` for reusable presentation;
  use `components/layout` for the site shell. Home-only sections belong in
  `features/home`, rather than the shared component collection.
- **Browser API services:** use the matching domain under `src/services`. Keep
  common request/error handling in `services/http/api-client.js`. Existing facility
  fixture behavior is retained; organization does not turn fixture discovery into
  an additional backend feature.
- **Private backend access:** use `src/server`. Keep credentials and Django cookies
  out of client components. Staff mutations remain server actions in
  `features/staff`; their `use server` directives were retained.
- **Styles and assets:** global CSS remains `app/globals.css`; feature styles stay
  with their feature. Use `assets` for imported resources and `public` for stable
  public URLs. Public files, fonts, CSS and image bytes were not changed.
- **Imports:** use `@/` between source folders and relative imports for siblings.
  Do not add broad barrel exports that hide client/server boundaries.
- **Tests:** keep the current small unit suite under `tests`, and put tests that
  run the real local backend under `tests/integration`. Shared setup remains
  `tests/setup.js`. Existing configuration and discovery patterns are unchanged.

The Django applications, migrations, databases, scripts and root framework
configuration were deliberately left in place. Moving them is a separate backend
or deployment refactor. Template SVGs and historical release manifests are retained;
an old delivery manifest describes its original release, not the current tree.

## Significant moves

- `components/landing.jsx` → `features/home/landing-sections.jsx`.
- Brand/header/footer/mobile menu → `components/layout/`.
- `components/ui.jsx` → `components/ui/primitives.jsx`; shared notices → `components/ui/`.
- `features/backend-status.js` → `config/backend.js`.
- `images/logo.jpg` → `assets/images/logo.jpg`.
- The six flat service files → booking, payments, facilities and http service folders.

Static imports, dynamic module references, test mocks and relative imports were
checked and updated. Function names, exports and dependencies are unchanged.

## Verification

The baseline passed 74 unit tests, ESLint and the enabled webpack production build.
The pre-refactor build also passed the real local payment browser scenario and
desktop/mobile navigation checks. No failures were found in those baseline checks. This JavaScript project
has no separate TypeScript configuration or type-check command; the Next.js build
performs the framework checks available here. Webpack is the established local
build option after the earlier Windows Turbopack worker issue.

After each move batch, the existing tests passed. A private syntax-tree audit
checked all 102 existing JS/JSX modules and confirmed that only module locations
and their references changed. Protected directives and module targets were retained.
New navigation regressions cover desktop/mobile links, main pages, protected-page
redirects, missing-page handling, logo loading and failed asset requests.

Final verification passed the same 74 unit tests, ESLint and webpack build, plus
all three integration browser tests. The built App Router manifest retained all
21 route entries. Homepage screenshots at 390px and 1440px matched the baseline
pixel-for-pixel. Existing styles, public asset/font bytes, backend files,
environment examples, configuration and dependency files were verified unchanged.

Repeat the frontend checks from the project root:

```powershell
npm test
npm run lint
```

For the enabled build and real local browser suite, use the environment and commands
in [PAYMENT-INTEGRATION.md](PAYMENT-INTEGRATION.md). The full integration configuration
now includes navigation tests as well as the existing payment workflow. Tests use
disposable records and non-payable fixtures; production credentials are not needed.

Pre-refactor source/assets and the move map are saved in the ignored
`.rim-rally/frontend-organization-before/` directory. The older payment-integration
restore utility is pinned to its original source paths/hashes and will intentionally
refuse to overwrite this newer refactor; do not force it through structural changes.
