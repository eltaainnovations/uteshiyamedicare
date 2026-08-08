# Uteshiya Medicare — Distributor Portal — Project Context

> Keep this file at the root of the repo (e.g. `PROJECT_CONTEXT.md`). Paste its
> contents into a new Claude chat at the start of any dev session to give full
> context without re-explaining the project.

## 1. What this is

Eltaa innovations is building a **Distributor Portal** for
Uteshiya Medicare — a medical device / implant distribution business. The portal
has two sides: an **Admin Panel** (Uteshiya staff) and a **Distributor Panel**
(their distributor customers), and it must stay in real-time sync with
Uteshiya's existing **ERPNext** instance.

- **Repo:** https://github.com/eltaainnovations/uteshiyamedicare.git
- **Stack decision:** React (frontend) + **FastAPI** (backend)
- **Design reference:** Figma Make prototype, file key `Okkl6aZ7swGCgslYkop77J`
  (React/TS, currently frontend-only with mock data — see §4)

## 2. Tech stack

| Layer | Choice |
|---|---|
| Frontend | React (TypeScript) |
| Backend | FastAPI (Python) |
| Design source | Figma Make prototype (React/TS, being ported/rebuilt, not copy-pasted as-is) |
| ERP | ERPNext — external system of record, bidirectional sync required |
| Courier tracking | Maruti Couriers API (pending credentials from Uteshiya) |
| Auth | Email/password, session timeout after 10 min inactivity, optional 2FA |

Open infra questions still pending from Uteshiya Medicare (**TO BE CONFIRMED**):
- Maruti Couriers API docs/credentials/sandbox
- ERPNext API keys/docs
- Cloud hosting — provided by Uteshiya or vendor-managed (AWS/Azure/GCP)?
- Which database is ERPNext currently running on?
- Deployment target — Dockerized or not?

## 3. Scope of work

### 3.1 UI/UX
- Professional, responsive design (web + mobile)
- Brand-aligned to Uteshiya Medicare color scheme
- WCAG 2.1 AA accessibility

### 3.2 Admin Panel
- **User Management & RBAC** — CRUD on distributor accounts, roles
  (Admin/Manager/Distributor/etc.), status (Active/Inactive/Suspended)
- **Insights Dashboard** — specific chart types matter here:
  - Revenue Trend → area/line chart
  - Top 10 Products / Top 10 Distributors by Orders → horizontal bar
  - Distributor-wise Turnover → treemap or horizontal bar
  - Order Fulfillment status mix → donut + KPI cards
  - Doctor/Hospital consumption pattern → heatmap matrix or stacked bar
  - Batch-wise complaint analysis → column chart
  - Order-wise complaint analysis → Pareto chart (column + line)
  - Demand forecasting → line chart with forecast overlay
  - Inventory planning → gauge + column chart
- **User Email Management** — welcome emails, password reset, status-change
  notifications, order confirmation emails (order summary, items, ETA,
  customizable templates)
- **Permissions Management** — granular per-role, module-level, data
  visibility restrictions
- **Product Catalogue & Pricing CRUD** — SKUs, base/discount/promo pricing,
  bulk CSV/Excel import, categorization/tagging, inventory sync with ERPNext

### 3.3 Distributor Panel
- **Insights Dashboard** — YTD orders, pending orders, total value, order
  status breakdown, top-selling products, monthly sales trend, quick actions
- **Login/Auth** — email/password, "remember me", 10-min session timeout,
  optional 2FA
- **Product Catalogue & Filters** — category/SKU/price filters, text search,
  sort, real-time availability
- **Active Orders** — Pending/Confirmed/Shipped/Delivered, cancel if
  eligible, optional edit-before-confirmation
- **Completed Orders** — date-range filter, export (PDF/CSV), one-click
  reorder
- **Order Tracking** — by docket number via Maruti Couriers API; fallback to
  a dynamic hyperlink to Maruti's tracking page if API unavailable; dispatch
  email notification
- **Profile** — user details, password change, billing/shipping addresses
  (multiple), notification/language preferences
- **Order History** — full record, advanced filters, downloadable PDFs
- **Invoices** — auto-generate PDF w/ GST per Indian regulation, invoice
  numbering, **must include the docket number**, download + auto-email
- **Inventory Management** — own stock levels, add/subtract stock, audit
  log, configurable low-stock alerts, optional forecasting
- **End-User / Implant Tracking & Feedback** — doctor/hospital/location,
  SKU/Batch ID + quantity + implantation date, post-op feedback/complications/
  satisfaction rating, linked to the distributor's order history for
  traceability, exportable reports for quality/regulatory use, and
  feedback-based quality insights (flag problem SKUs/batches)

### 3.4 ERPNext bidirectional sync — this is the hard part

Real-time (**<2s**) two-way sync between the Portal and ERPNext, with ERPNext
as source of truth on conflicts.

**Portal → ERPNext:** product/pricing/inventory updates, new distributor user
→ auto-created as ERPNext Sales Customer, permission changes → ERPNext role
updates. All changes carry timestamp + user audit trail.

**ERPNext → Portal:** product/pricing/inventory changes via webhook, new
ERPNext customer → synced to Portal, new sales order → live status in Portal.
Portal validates and rejects conflicting updates.

**Conflict resolution:** same-field simultaneous edits → ERPNext wins; Portal
keeps `last_updated_by` + timestamp version control; conflicts logged +
notify admin; manual override with approval workflow for critical fields;
auto-rollback on failed sync.

**Architecture:** queue-based (webhooks + event handlers), not polling.

**Entities requiring two-way sync:** Products (Item Master, incl. HSN code),
Pricing Rules, Inventory/Stock Levels (warehouse-wise, reserved vs
available), Customers/Distributors, User Accounts, Sales Orders, Invoices,
End-User Feedback.

**Reliability:** 3 retries w/ exponential backoff → dead-letter queue on
failure; Portal falls back to read-only if ERPNext is unreachable; heartbeat
monitoring + admin alerts; pre/post-sync data integrity checks; rollback to
last-known-good state; 24/7 sync-status dashboard.

**Security/compliance:** API keys + OAuth 2.0, TLS in transit, sync
trigger/approval restricted to authorized users, full audit trail, schema
validation before sync, rate limit (max 1000 updates/min), ISO/FDA/IRDAI
audit-readiness.

### 3.5 Change requests / scope refinements (round 2)

These supersede parts of §3.2/§3.3 above — noted inline where they conflict
with the original scope doc.

1. **2FA on sign-in is now mandatory** (§3.3 originally listed 2FA as
   optional — this makes it required).
2. **Item return-order-level alerts** — display an alert when an item's
   stock reaches its configured *return order level* (distinct from the
   existing low-stock reorder alert in §3.3 Inventory Management).
3. **Remove item/product creation from the Distributor Portal** — product
   creation stays an Admin-only capability (§3.2 Product Catalogue CRUD);
   distributors should not have a "create product" option at all.
4. **Remove the permission-update feature** — the granular permissions
   management described in §3.2 is out of scope; do not build a UI for
   editing user permissions.
5. **Distributor Management (Admin Panel)** — new "Distributors" item in
   the Admin sidebar, listing all distributors.
6. **Distributor filter on every dashboard** — Admin
   insights dashboards (§3.2/§3.3) need a distributor selector; selecting
   one scopes the whole view (orders, invoices, products,
   reports) to that distributor. This is an Admin-side capability for
   drilling into a specific distributor's data.
7. **Display item/product variants** — show product child records
   (variants) wherever a product appears in the portal, not just the
   parent SKU.
8. **Sales Person workflow (new role)** — a Sales Person manages multiple
   distributors and can create an order on behalf of a selected
   distributor. That order is a **draft/pending** order routed to the
   distributor for verification; the real Sales Order is only created once
   the distributor approves it. This is a new approval step ahead of order
   creation, on top of the existing Order/ERPNext sync flow in §3.4.
9. **User-creation approval workflow** — when the Admin creates a user, it
   starts in **Draft** status and an approval request goes to an
   admin-assigned email address (address to be provided later) so the
   Role Profile can be reviewed. The user is only created/activated once
   that document is submitted/approved — no more direct-create-and-active
   in one step.

## 4. Current state — Figma Make prototype

A React/TS prototype exists in Figma Make (not yet the FastAPI-backed real
app). Structure, for reference when porting/rebuilding:

```
src/
  App.tsx                     # role state ('admin'|'distributor') gates
                               # everything; screen state + switch statement
                               # renders the active screen inside Layout;
                               # no router lib — plain state-based routing
  main.tsx
  contexts/
    ThemeContext.tsx
    CartContext.tsx
  components/
    Layout.tsx                 # shell + nav; exports the `Screen` type
    Login.tsx
    Placeholder.tsx             # generic stub component
    admin/
      Dashboard.tsx      Analytics.tsx     Orders.tsx
      Permissions.tsx    ProductCatalogue.tsx
      Reports.tsx        Settings.tsx      UserManagement.tsx
    distributor/
      Dashboard.tsx        ProductCatalogue.tsx   ActiveOrders.tsx
      CartDrawer.tsx       TrackShipment.tsx      Invoices.tsx
  imports/
    uteshiya-medicare-distributor-.md   # = §3 of this doc (scope of work)
    uteshiya-medicare-portal-desig.md   # design notes
    uteshiya_medicare_.png + reference screenshots
```

**Built (has real UI):** Login, Layout, both Dashboards, admin
Analytics/Orders/Permissions/ProductCatalogue/Reports/Settings/UserManagement,
distributor ProductCatalogue/ActiveOrders/TrackShipment/Invoices/CartDrawer.

**Still placeholder stubs (need real implementation):**
- Admin: `email-management`, `erp-sync`
- Distributor: `dist-completed-orders`, `dist-inventory`,
  `dist-end-users` (implant/doctor/hospital tracking), `dist-profile`
  (GST/PAN, shipping addresses)

The prototype is frontend-only with no real backend — it's a UI/UX
reference, not code to lift wholesale into the FastAPI-backed build.

## 5. Suggested build order

1. FastAPI backend skeleton — auth (**mandatory 2FA**, JWT, session
   timeout), role model (**Admin/Manager/Distributor/Sales Person** — note
   the added Sales Person role and dropped granular permission-editing,
   §3.5), core data models (Product incl. variants, Pricing, Inventory,
   Order incl. draft/approval status, Invoice, Customer/Distributor,
   EndUserRecord, User incl. Draft/approval status)
2. React frontend skeleton wired to the real API (reuse Figma Make's
   screen/nav pattern, replace mock data with API calls)
3. Core CRUD flows: Product Catalogue (**admin-only creation**, variants
   displayed), Orders, Invoices, Inventory (incl. return-order-level
   alerts alongside low-stock alerts)
4. Approval workflows — user-creation Draft → email approval → activate;
   Sales Person draft order → distributor approval → Sales Order. Build
   these early since they change the Order and User data models, not as
   an add-on later.
5. Admin "Distributors" list + distributor filter across dashboards
6. Remaining placeholder screens: End-User Records, Completed Orders,
   Profile, Inventory (distributor side)
7. Email automation (welcome/reset/status/order-confirmation/approval
   requests)
8. Maruti Couriers tracking integration (once credentials confirmed)
9. ERPNext bidirectional sync — highest complexity, do last once core
   Portal data models are stable, since sync logic depends on final schema
10. Insights dashboards (charting), each wired to the distributor filter
    from #5 — can be built in parallel with #3–4/#6 once core data models
    exist, since chart data comes from those same entities
