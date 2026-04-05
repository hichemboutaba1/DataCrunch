import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { hashPassword, signToken } from "@/lib/auth";

export async function POST(request) {
  try {
    const { full_name, organization_name, email, password } = await request.json();

    if (!full_name || !organization_name || !email || !password) {
      return NextResponse.json({ error: "Tous les champs sont requis" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Le mot de passe doit contenir au moins 8 caractères" }, { status: 400 });
    }

    const db = await loadDB();

    // Check existing user
    const existing = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: "Un compte existe déjà avec cet email" }, { status: 409 });
    }

    const hashed_password = await hashPassword(password);

    // Create org
    const orgId = nextId(db);
    const org = { id: orgId, name: organization_name };
    db.orgs = [...(db.orgs || []), org];

    // Create user
    const userId = nextId(db);
    const user = { id: userId, email: email.toLowerCase(), hashed_password, full_name, organization_id: orgId };
    db.users = [...(db.users || []), user];

    // Create subscription
    const subId = nextId(db);
    const subscription = {
      id: subId,
      organization_id: orgId,
      status: "trialing",
      monthly_quota: 100,
      documents_used: 0,
    };
    db.subscriptions = [...(db.subscriptions || []), subscription];

    await saveDB(db);

    const access_token = await signToken({ sub: email.toLowerCase(), userId, orgId });
    return NextResponse.json({ access_token }, { status: 201 });
  } catch (err) {
    console.error("Register error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
