// analyzeRedFlags(extracted, metrics)
// metrics is pre-computed by lib/analysis.js computeMetrics()
// Each flag: { severity, category, label, detail, recommendation }
// Severities: CRITICAL > HIGH > MEDIUM > LOW

export function analyzeRedFlags(extracted, metrics = {}) {
  const flags = [];
  const type = extracted.document_type;

  function flag(severity, category, label, detail, recommendation) {
    flags.push({ severity, category, label, detail, recommendation });
  }

  // ─────────────────────────────────────────
  // FINANCIAL STATEMENT
  // ─────────────────────────────────────────
  if (type === "financial_statement") {
    const revenue     = metrics.revenue     ?? 0;
    const expenses    = metrics.expenses    ?? 0;
    const ebitda      = metrics.ebitda;
    const netIncome   = metrics.net_income;
    const assets      = metrics.assets      ?? 0;
    const liabilities = metrics.liabilities ?? 0;
    const equity      = metrics.equity;
    const debtRatio   = metrics.debt_ratio;
    const ebitdaMargin = metrics.ebitda_margin;
    const expRatio    = metrics.expense_ratio;

    // ── CRITICAL ──

    // Balance sheet mismatch
    if (metrics.balance_mismatch) {
      flag("CRITICAL", "Intégrité des données",
        "Déséquilibre Actif/Passif",
        metrics.balance_mismatch_detail || `Actif ≠ Passif + Capitaux propres (écart: ${(metrics.balance_mismatch_amount || 0).toLocaleString("fr-FR")})`,
        "Vérifier la comptabilité source. Ne pas utiliser ces données pour valorisation avant correction."
      );
    }

    // Missing critical data
    if (revenue === 0 && (!extracted.revenue?.items || extracted.revenue.items.length === 0)) {
      flag("CRITICAL", "Données manquantes",
        "Chiffre d'affaires absent",
        "Aucun revenu extrait du document — analyse financière impossible",
        "Fournir un document financier complet avec le compte de résultat."
      );
    }

    // Negative equity
    if (equity != null && equity < 0) {
      flag("CRITICAL", "Structure financière",
        "Capitaux propres négatifs",
        `Fonds propres: ${equity.toLocaleString("fr-FR")} — situation d'insolvabilité technique`,
        "Analyser les pertes cumulées. Vérifier l'existence d'un plan de redressement ou d'une recapitalisation."
      );
    }

    // ── HIGH ──

    // EBITDA negative
    if (ebitda != null && revenue > 0 && ebitdaMargin < 0) {
      flag("HIGH", "Rentabilité",
        "EBITDA négatif",
        `Marge EBITDA: ${(ebitdaMargin * 100).toFixed(1)}% — perte opérationnelle avant intérêts et taxes`,
        "Analyser le plan de réduction des charges. Évaluer la viabilité du modèle économique."
      );
    } else if (ebitda != null && revenue > 0 && ebitdaMargin < 0.05) {
      flag("HIGH", "Rentabilité",
        "Marge EBITDA critique",
        `Marge EBITDA: ${(ebitdaMargin * 100).toFixed(1)}% — en dessous du seuil de viabilité (5%)`,
        "Identifier les postes de charges compressibles. Revoir la politique de pricing."
      );
    }

    // Net income negative
    if (netIncome != null && netIncome < 0) {
      flag("HIGH", "Rentabilité",
        "Résultat net négatif",
        `Perte nette: ${netIncome.toLocaleString("fr-FR")} — exercice déficitaire`,
        "Analyser la cause: charges financières élevées, provisions exceptionnelles, ou perte d'exploitation structurelle."
      );
    }

    // Charge ratio critical
    if (revenue > 0 && expRatio != null) {
      if (expRatio > 0.95) {
        flag("HIGH", "Charges",
          "Ratio de charges critique",
          `Charges = ${(expRatio * 100).toFixed(1)}% du CA — marge quasi nulle`,
          "Effectuer une analyse détaillée poste par poste. Identifier les charges non récurrentes."
        );
      } else if (expRatio > 0.90) {
        flag("MEDIUM", "Charges",
          "Charges opérationnelles élevées",
          `Charges = ${(expRatio * 100).toFixed(1)}% du CA (seuil d'alerte: 90%)`,
          "Benchmarker les charges versus les standards sectoriels. Analyser les leviers d'optimisation."
        );
      }
    }

    // High leverage
    if (equity != null && equity > 0 && liabilities > 0) {
      const leverage = liabilities / equity;
      if (leverage > 3) {
        flag("HIGH", "Structure financière",
          "Levier financier excessif",
          `Dettes/Fonds propres: ${leverage.toFixed(2)}x (seuil critique: 3x)`,
          "Évaluer la capacité de remboursement. Analyser les échéances de dette et les covenants bancaires."
        );
      } else if (leverage > 2) {
        flag("MEDIUM", "Structure financière",
          "Levier financier élevé",
          `Dettes/Fonds propres: ${leverage.toFixed(2)}x (seuil alerte: 2x)`,
          "Surveiller le ratio de couverture des intérêts (EBITDA/Frais financiers)."
        );
      }
    }

    // Debt ratio
    if (debtRatio != null && debtRatio > 0.85) {
      flag("HIGH", "Structure financière",
        "Endettement excessif",
        `Ratio dettes/actifs: ${(debtRatio * 100).toFixed(1)}% — financement quasi-intégralement par dettes`,
        "Analyser les conditions et maturités de la dette. Évaluer le risque de refinancement."
      );
    } else if (debtRatio != null && debtRatio > 0.70) {
      flag("MEDIUM", "Structure financière",
        "Endettement élevé",
        `Ratio dettes/actifs: ${(debtRatio * 100).toFixed(1)}% (seuil alerte: 70%)`,
        "Surveiller l'évolution du ratio sur plusieurs exercices."
      );
    }

    // ── MEDIUM ──

    // Missing EBITDA and not computable
    if (ebitda == null && (revenue === 0 || expenses === 0)) {
      flag("MEDIUM", "Données manquantes",
        "EBITDA non calculable",
        "CA ou charges manquants — impossible de calculer la rentabilité opérationnelle",
        "Obtenir le compte de résultat complet avec détail des revenus et charges."
      );
    }

    // Low but positive EBITDA
    if (ebitda != null && revenue > 0 && ebitdaMargin >= 0.05 && ebitdaMargin < 0.10) {
      flag("MEDIUM", "Rentabilité",
        "Marge EBITDA faible",
        `Marge EBITDA: ${(ebitdaMargin * 100).toFixed(1)}% — en dessous de la moyenne sectorielle (10%)`,
        "Comparer aux benchmarks sectoriels. Identifier les leviers de croissance de marge."
      );
    }

    // ── LOW ──

    // Missing balance sheet
    if (assets === 0 && liabilities === 0) {
      flag("LOW", "Données manquantes",
        "Bilan non disponible",
        "Actif et passif absents — analyse bilancielle impossible",
        "Demander le bilan comptable complet pour une due diligence complète."
      );
    }
  }

  // ─────────────────────────────────────────
  // REVENUE LIST
  // ─────────────────────────────────────────
  if (type === "revenue_list") {
    const clients   = extracted.clients || [];
    const total     = metrics.total_revenue ?? clients.reduce((a, c) => a + (c.revenue || 0), 0);
    const top1Pct   = metrics.top_client_pct ?? 0;
    const top3Pct   = metrics.top3_pct ?? 0;

    // Critical concentration
    if (top1Pct > 0.50) {
      flag("CRITICAL", "Concentration clients",
        "Dépendance critique — client unique",
        `Le 1er client représente ${(top1Pct * 100).toFixed(1)}% du CA — risque existentiel en cas de churn`,
        "Évaluer la solidité du contrat avec ce client. Prioriser la diversification commerciale."
      );
    } else if (top1Pct > 0.30) {
      flag("HIGH", "Concentration clients",
        "Forte dépendance client",
        `Le 1er client représente ${(top1Pct * 100).toFixed(1)}% du CA (seuil critique: 30%)`,
        "Analyser la durée et les conditions du contrat. Accélérer l'acquisition de nouveaux clients."
      );
    }

    if (top3Pct > 0.80 && top1Pct <= 0.50) {
      flag("HIGH", "Concentration clients",
        "Top 3 clients — concentration élevée",
        `Les 3 premiers clients représentent ${(top3Pct * 100).toFixed(1)}% du CA`,
        "Diversifier la base clients. Analyser les clauses de renouvellement."
      );
    } else if (top3Pct > 0.60) {
      flag("MEDIUM", "Concentration clients",
        "Concentration Top 3 significative",
        `Les 3 premiers clients: ${(top3Pct * 100).toFixed(1)}% du CA (seuil alerte: 60%)`,
        "Surveiller les renouvellements contractuels. Développer le pipeline commercial."
      );
    }

    if (clients.length <= 3 && clients.length > 0) {
      flag("HIGH", "Concentration clients",
        "Base clients très étroite",
        `Seulement ${clients.length} client(s) documenté(s) — risque structurel majeur`,
        "Présenter un plan de développement commercial détaillé. Analyser le pipeline."
      );
    } else if (clients.length <= 8) {
      flag("MEDIUM", "Concentration clients",
        "Base clients limitée",
        `${clients.length} clients — diversification insuffisante pour un portefeuille résilient`,
        "Évaluer la stratégie d'acquisition clients et le taux de churn historique."
      );
    }

    // Check computed vs stated total
    if (total > 0 && clients.length > 0) {
      const computedTotal = clients.reduce((a, c) => a + (c.revenue || 0), 0);
      if (extracted.total_stated != null) {
        const diff = Math.abs(computedTotal - extracted.total_stated);
        const tolerance = Math.max(1, extracted.total_stated * 0.005);
        if (diff > tolerance) {
          flag("HIGH", "Intégrité des données",
            "Incohérence dans le total CA",
            `Somme clients: ${computedTotal.toLocaleString("fr-FR")} ≠ Total déclaré: ${extracted.total_stated.toLocaleString("fr-FR")} (écart: ${diff.toLocaleString("fr-FR")})`,
            "Vérifier les données sources. Obtenir le détail complet de la liste clients."
          );
        }
      }
    }
  }

  // ─────────────────────────────────────────
  // PAYROLL
  // ─────────────────────────────────────────
  if (type === "payroll") {
    const employees = extracted.employees || [];
    const salaryRatio = metrics.salary_ratio;

    if (employees.length === 0) {
      flag("HIGH", "Masse salariale",
        "Aucun employé extrait",
        "Données de paie illisibles — analyse RH impossible",
        "Fournir un fichier de paie structuré ou un tableau récapitulatif des salaires."
      );
    }

    if (salaryRatio != null && salaryRatio > 20) {
      flag("HIGH", "Masse salariale",
        "Disparité salariale excessive",
        `Ratio max/min salaire: ${salaryRatio.toFixed(0)}x (${(metrics.min_salary || 0).toLocaleString("fr-FR")} → ${(metrics.max_salary || 0).toLocaleString("fr-FR")})`,
        "Vérifier la cohérence de la grille salariale. Analyser les packages de rémunération des dirigeants."
      );
    } else if (salaryRatio != null && salaryRatio > 10) {
      flag("MEDIUM", "Masse salariale",
        "Écart salarial élevé",
        `Ratio max/min: ${salaryRatio.toFixed(1)}x`,
        "Analyser la structure de rémunération et comparer aux standards du marché."
      );
    }

    // Check stated vs computed total
    if (extracted.total_gross_stated != null && employees.length > 0) {
      const computed = employees.reduce((a, e) => a + (e.gross_salary || 0), 0);
      const diff = Math.abs(computed - extracted.total_gross_stated);
      const tolerance = Math.max(1, extracted.total_gross_stated * 0.01);
      if (diff > tolerance) {
        flag("MEDIUM", "Intégrité des données",
          "Incohérence masse salariale",
          `Somme salaires bruts: ${computed.toLocaleString("fr-FR")} ≠ Total déclaré: ${extracted.total_gross_stated.toLocaleString("fr-FR")} (écart: ${diff.toLocaleString("fr-FR")})`,
          "Vérifier que tous les employés sont bien inclus dans le document fourni."
        );
      }
    }

    // Missing net salaries
    const missingNet = employees.filter(e => e.net_salary == null || e.net_salary === 0).length;
    if (missingNet > employees.length * 0.5 && employees.length > 0) {
      flag("LOW", "Données manquantes",
        "Salaires nets partiellement absents",
        `${missingNet}/${employees.length} employés sans salaire net extrait`,
        "Compléter avec les bulletins de paie individuels."
      );
    }
  }

  // ─────────────────────────────────────────
  // SORT: CRITICAL > HIGH > MEDIUM > LOW
  // ─────────────────────────────────────────
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  flags.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return flags;
}
