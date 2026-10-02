/**
 * Starter Product Behavior Specification, committed into the repo on
 * "Initialize spec in repo" when SPEC_PATH does not exist yet.
 *
 * This is deliberately incomplete in places — the gaps are what the
 * consistency check is supposed to find.
 */
export const SEED_SPEC = `# Product Behavior Specification — Wyze Subscription Management

Version: draft 1
Owner: Services PM
Status: source of truth for the AI-native product development pilot

This document is the single source of truth for subscription and add-on
behavior. Prototypes, test plans, and implementations are derived from it — not
the other way round. Every behavioral statement carries a rule ID (R-xxx) so
downstream artifacts can cite it.

## 1. Purchase channels

A subscription is always associated with the channel it was purchased in.

- **iOS IAP** — purchased through the App Store. Billing, renewal, and refunds
  are controlled by Apple.
- **Android IAP** — purchased through Google Play. Billing, renewal, and refunds
  are controlled by Google.
- **Website** — purchased at wyze.com. Billing is controlled by Wyze.
- **Retail activation** — a subscription code included with a device bought at
  retail, redeemed in the app. No payment instrument is attached.

## 2. Entitlement scopes

- **Account-level** — *Cam Unlimited*. One subscription, covers every eligible
  camera on the account.
- **Device-level** — *Cam Plus*. Bound to a single device, identified by MAC.
- **Add-ons** — bolt onto an existing plan (for example extended video history).
  An add-on is only meaningful while its parent entitlement is active.

## 3. Rules

### Entitlement resolution

- **R-101** — An account-level entitlement covers all eligible devices on the
  account. A device needs no device-level subscription of its own to receive
  account-level features.
- **R-102** — Where an account-level and a device-level entitlement overlap on
  the same device, the higher entitlement wins for feature access. Billing is
  independent of resolution: the user continues to be billed for both
  subscriptions until one is explicitly cancelled.

### Cross-channel purchase

- **R-201** — A user must not hold two entitlements that grant the same features
  to the same device through different channels. Before completing a purchase
  that would create such an overlap, the app warns the user and names the
  existing entitlement and its channel.
- **R-202** — A retail activation grants an entitlement with no billing
  relationship and no auto-renewal. At the end of its term it expires; it does
  not renew and it does not charge.

### Lifecycle

- **R-301** — Cancellation is not immediate. The entitlement remains active
  until the end of the paid period, then expires.
- **R-302** — When a renewal payment fails, the subscription enters a 16-day
  grace period during which the entitlement remains active. This applies to IAP
  channels only.
- **R-303** — A refund revokes the entitlement immediately, regardless of the
  remaining paid period.

### Management surface

- **R-401** — A subscription is managed in the channel it was purchased in. The
  Services page shows every subscription regardless of channel, and deep-links
  to the correct management surface (App Store, Google Play, or the Wyze
  website) rather than attempting to manage it in place.

## 4. Lifecycle states

A subscription is in exactly one of these states:

- **Active** — entitlement granted, billing current.
- **Cancelled pending expiry** — user cancelled; entitlement still granted until
  period end (R-301).
- **Expired** — entitlement withdrawn; no billing relationship.
- **Renewing** — renewal in flight.
- **Grace period** — renewal failed; entitlement still granted for up to 16 days
  (R-302).
- **Refunded** — entitlement revoked immediately by refund (R-303).

## 5. Prototype coverage

The clickable prototype visualizes only these flows. Anything not listed here
has never been seen by a reviewer:

- Website annual purchase and management
- Device-level Cam Plus purchase via IAP
- Website cancellation flow
- Cam Plus to Cam Unlimited upgrade
`;

export const SEED_COMMIT_MESSAGE = 'spec: initialize product behavior specification';
export const SEED_PR_TITLE = 'spec: initialize product behavior specification';
export const SEED_PR_BODY = `Initializes the Product Behavior Specification for the AI-native product
development pilot.

Starter content covers purchase channels, entitlement scopes, rules R-101
through R-401, lifecycle states, and the current prototype coverage list.
Review the behavior, not just the prose — everything downstream compiles from
this file.`;
