import { NextResponse } from "next/server";
import { loadDB, saveDB, nextId } from "@/lib/db";
import { authenticate } from "@/lib/auth";
import { hashPassword } from "@/lib/auth";

export async function GET(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const db = await loadDB();
    const members = (db.users || [])
      .filter((u) => u.organization_id === payload.orgId)
      .map(({ hashed_password, ...rest }) => rest);

    return NextResponse.json({ members });
  } catch (err) {
    console.error("Invite GET error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { email, full_name } = await request.json();
    if (!email || !full_name) {
      return NextResponse.json({ error: "Email et nom requis" }, { status: 400 });
    }

    const db = await loadDB();

    const existing = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return NextResponse.json({ error: "Un utilisateur existe déjà avec cet email" }, { status: 409 });
    }

    // Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-10);
    const hashed_password = await hashPassword(tempPassword);

    const userId = nextId(db);
    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      hashed_password,
      full_name,
      organization_id: payload.orgId,
      invited: true,
      temp_password: tempPassword,
    };
    db.users = [...(db.users || []), newUser];
    await saveDB(db);

    return NextResponse.json({
      message: "Membre invité avec succès",
      temp_password: tempPassword,
      user: { id: userId, email, full_name },
    }, { status: 201 });
  } catch (err) {
    console.error("Invite POST error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const payload = await authenticate(request);
    if (!payload) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

    const { userId: targetUserId } = await request.json();
    if (!targetUserId) return NextResponse.json({ error: "userId requis" }, { status: 400 });

    const db = await loadDB();

    // Can't delete yourself
    if (targetUserId === payload.userId) {
      return NextResponse.json({ error: "Impossible de supprimer votre propre compte" }, { status: 400 });
    }

    const targetUser = (db.users || []).find((u) => u.id === targetUserId && u.organization_id === payload.orgId);
    if (!targetUser) return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });

    db.users = db.users.filter((u) => u.id !== targetUserId);
    await saveDB(db);

    return NextResponse.json({ message: "Membre supprimé" });
  } catch (err) {
    console.error("Invite DELETE error:", err);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
