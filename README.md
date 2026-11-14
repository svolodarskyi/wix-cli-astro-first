# Issa Green storefront

Astro storefront on Wix-managed headless. Design source: svolodarskyi/issagreenredesign (ported 1:1).

## Pages
- Content: `/`, `/our-story`, `/farmers`, `/experiences`, `/find-us`, `/shipping`, `/order-confirmation`, `404`, `/workshops/*`
- Shop (design data, static): `/shop-tea`, `/tea-ware`, `/tea-selection`, `/products/<slug>` (18 products; data in `window.PDP`, behaviour in `public/pdp.js`)
- Cart: the design drawer (`public/cart.js`, localStorage). Wix catalog + cart wiring is the next step (the Wix store components are kept under `src/components/storefront` and `src/wix`).

## Wix
Site id and app id are in `wix.config.json`. `npm install`, `npx astro build`, then release the build.
