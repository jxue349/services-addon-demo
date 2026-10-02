# Parent Behavior Specification — Wyze Service Subscriptions

Knowledge base for all service-team subscription, entitlement, and upsell
behavior. Child specs are distilled and merged into this document.

## 1. Purchase channels

- **iOS IAP** — App Store. Billing, renewal, refunds controlled by Apple.
- **Android IAP** — Google Play. Billing controlled by Google.
- **Website** — wyze.com. Billing controlled by Wyze.
- **Retail activation** — a code redeemed in the app; no payment instrument.

## 2. Entitlement scopes

- **Account-level** — Cam Unlimited. Covers every eligible camera.
- **Device-level** — Cam Plus. Bound to one device.
- **Add-ons** — bolt onto an existing plan.

## 3. Rules

### Entitlement resolution

- **R-101** — An account-level entitlement covers all eligible devices on the account.
- **R-102** — Where account-level and device-level entitlements overlap on a device, the
  higher entitlement wins for feature access. Billing is independent: both continue to
  bill until one is explicitly cancelled.

### Cross-channel purchase

- **R-201** — A user must not hold two entitlements granting the same features to the same
  device through different channels. The app warns before completing such a purchase.
- **R-202** — A retail activation grants an entitlement with no billing relationship and no
  auto-renewal. It expires at the end of its term.

### Lifecycle

- **R-301** — Cancellation is not immediate. The entitlement remains active until the end of
  the paid period, then expires.
- **R-302** — When a renewal payment fails, the subscription enters a 16-day grace period
  during which the entitlement remains active. This applies to IAP channels only.
- **R-303** — A refund revokes the entitlement immediately, regardless of remaining period.

### Management surface

- **R-401** — A subscription is managed in the channel it was purchased in. The Services page
  deep-links to the correct surface rather than managing in place.

## 4. Lifecycle states

Active, Cancelled pending expiry, Expired, Renewing, Grace period, Refunded.

## 5. Prototype coverage

- Website annual purchase and management
- Device-level Cam Plus purchase via IAP
- Website cancellation flow
- Cam Plus to Cam Unlimited upgrade
