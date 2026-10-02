# Cam Plus — spec v1

Device-level subscription behavior for Cam Plus, including upsell.

## Rules

- **CAMPLUS-R-101** — A device-level upsell prompt is shown at most once per billing period
  per device.
- **CAMPLUS-R-102** — When a renewal payment fails, a 30-day grace period applies before the
  entitlement is withdrawn.
- **CAMPLUS-R-103** — An account-level entitlement covers all eligible devices on the account.
- **CAMPLUS-R-104** — A user who declines an upsell three times is not prompted again for 90
  days.

## Prototype coverage

- Device Cam Plus purchase via IAP
