import { NextResponse } from "next/server";
import { loadDB } from "@/lib/db";
import { verifyPassword, signToken } from "@/lib/auth";

export async function POST(request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const db = await loadDB();
    const user = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const valid = await verifyPassword(password, user.hashed_password);
    if (!valid) {
      return NextResponse.json({ error: "Identifiants incorrects" }, { status: 401 });
    }

    const access_token = await signToken({
      sub: user.email,
      userId: user.id,
      orgId: user.organization_id,
    });

    return NextResponse.json({ access_token });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
