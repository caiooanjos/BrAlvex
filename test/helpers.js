// Dados de exemplo fictícios para os testes.
export function validLead(overrides = {}) {
  return {
    objective: "reduce_costs",
    company: "Empresa Exemplo",
    sector: "logistics",
    job_role: "Diretora de operações",
    website: "exemplo.com.br",
    company_size: "51_200",
    challenge: "Queremos reduzir o custo de roteirização da frota regional.",
    data_availability: "scattered",
    timing: "3_months",
    full_name: "Maria Exemplo",
    email: "maria@exemplo.com.br",
    country: "BR",
    whatsapp: "+55 11 91234-5678",
    ...overrides,
  };
}
