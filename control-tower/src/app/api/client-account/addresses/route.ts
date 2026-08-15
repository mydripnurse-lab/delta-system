import { NextResponse } from "next/server";
import type { PoolClient } from "pg";

import { getAuthenticatedClient, isTrustedClientRequest } from "@/lib/clientPortalAuth";
import { getDbPool } from "@/lib/db";
import { verifyMapboxAddress } from "@/lib/mapboxAddressVerification";

export const runtime = "nodejs";

function text(value: unknown) {
  return String(value ?? "").trim();
}

async function syncPreferredAddress(client: PoolClient, accountId: string) {
  const preferred = await client.query<{
    client_account_id: string; address_line_1: string; address_line_2: string; city: string; county: string; state: string;
    postal_code: string; country_code: string; mapbox_feature_id: string; verified_label: string; longitude: number; latitude: number;
  }>(`select client_account_id, address_line_1, address_line_2, city, county, state, postal_code, country_code,
             mapbox_feature_id, verified_label, longitude, latitude
        from app.client_addresses where client_account_id = $1 and is_default = true limit 1`, [accountId]);
  const row = preferred.rows[0];
  if (!row) return;
  await client.query(
    `update app.client_accounts
        set preferences = preferences || jsonb_build_object('address', jsonb_build_object(
          'addressLine1', $2, 'addressLine2', $3, 'city', $4, 'county', $5, 'state', $6,
          'postalCode', $7, 'countryCode', $8, 'verified', true, 'verificationProvider', 'mapbox',
          'mapboxFeatureId', $9, 'verifiedLabel', $10, 'longitude', $11, 'latitude', $12,
          'verifiedAt', now()
        )), updated_at = now()
      where id = $1`,
    [row.client_account_id, row.address_line_1, row.address_line_2, row.city, row.county, row.state, row.postal_code, row.country_code, row.mapbox_feature_id, row.verified_label, row.longitude, row.latitude],
  );
}

export async function POST(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to save an address." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const label = text(body?.label) || "Home";
  const addressLine1 = text(body?.addressLine1);
  const addressLine2 = text(body?.addressLine2);
  const city = text(body?.city);
  const state = text(body?.state);
  const postalCode = text(body?.postalCode);
  const countryCode = (text(body?.countryCode) || "US").toUpperCase();
  const selectedFeatureId = text(body?.addressFeatureId);
  if (!addressLine1 || !city || !state || !postalCode || !selectedFeatureId || label.length > 40 || addressLine2.length > 120) {
    return NextResponse.json({ ok: false, error: "Choose a complete verified address." }, { status: 400 });
  }
  let verified: Awaited<ReturnType<typeof verifyMapboxAddress>>;
  try {
    verified = await verifyMapboxAddress({ addressLine1, city, state, postalCode, countryCode, selectedFeatureId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Choose a verified address." }, { status: 422 });
  }
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const count = await client.query<{ count: string }>(`select count(*)::text as count from app.client_addresses where client_account_id = $1`, [account.id]);
    const makeDefault = body?.isDefault === true || Number(count.rows[0]?.count || 0) === 0;
    if (makeDefault) await client.query(`update app.client_addresses set is_default = false, updated_at = now() where client_account_id = $1`, [account.id]);
    const created = await client.query<{ id: string }>(
      `insert into app.client_addresses (
         client_account_id, label, address_line_1, address_line_2, city, county, state, postal_code,
         country_code, mapbox_feature_id, verified_label, longitude, latitude, is_default
       ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning id`,
      [account.id, label, verified.addressLine1, addressLine2, verified.city, verified.county, verified.state, verified.postalCode, verified.countryCode, verified.mapboxFeatureId, verified.verifiedLabel, verified.longitude, verified.latitude, makeDefault],
    );
    if (makeDefault) await syncPreferredAddress(client, account.id);
    await client.query("commit");
    return NextResponse.json({ ok: true, id: created.rows[0]?.id, address: { ...verified, addressLine2, label, isDefault: makeDefault } });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function PATCH(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = text(body?.id);
  const label = text(body?.label);
  if (!/^[0-9a-f-]{36}$/i.test(id) || (label && label.length > 40)) return NextResponse.json({ ok: false, error: "Invalid address." }, { status: 400 });
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    if (body?.isDefault === true) await client.query(`update app.client_addresses set is_default = false, updated_at = now() where client_account_id = $1`, [account.id]);
    const updated = await client.query(
      `update app.client_addresses
          set label = case when $3 <> '' then $3 else label end,
              is_default = case when $4 then true else is_default end,
              updated_at = now()
        where id = $2 and client_account_id = $1 returning id`,
      [account.id, id, label, body?.isDefault === true],
    );
    if (!updated.rowCount) { await client.query("rollback"); return NextResponse.json({ ok: false, error: "Address not found." }, { status: 404 }); }
    if (body?.isDefault === true) await syncPreferredAddress(client, account.id);
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function DELETE(request: Request) {
  if (!isTrustedClientRequest(request)) return NextResponse.json({ ok: false }, { status: 404 });
  const account = await getAuthenticatedClient();
  if (!account) return NextResponse.json({ ok: false, error: "Sign in again to continue." }, { status: 401 });
  const id = text((await request.json().catch(() => null) as { id?: unknown } | null)?.id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Invalid address." }, { status: 400 });
  const client = await getDbPool().connect();
  try {
    await client.query("begin");
    const removed = await client.query<{ is_default: boolean }>(`delete from app.client_addresses where id = $2 and client_account_id = $1 returning is_default`, [account.id, id]);
    if (!removed.rowCount) { await client.query("rollback"); return NextResponse.json({ ok: false, error: "Address not found." }, { status: 404 }); }
    if (removed.rows[0]?.is_default) {
      const next = await client.query<{ id: string }>(`select id from app.client_addresses where client_account_id = $1 order by created_at asc limit 1`, [account.id]);
      if (next.rows[0]) {
        await client.query(`update app.client_addresses set is_default = true, updated_at = now() where id = $1`, [next.rows[0].id]);
        await syncPreferredAddress(client, account.id);
      } else {
        await client.query(`update app.client_accounts set preferences = preferences - 'address', updated_at = now() where id = $1`, [account.id]);
      }
    }
    await client.query("commit");
    return NextResponse.json({ ok: true });
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}
