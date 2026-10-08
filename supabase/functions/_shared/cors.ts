export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return null;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Tratamento padrão do catch das funções: 401 para falha de autenticação, 400 para JSON
 * malformado e 500 genérico para o resto. O detalhe do erro vai só para o log da função
 * (não expõe nomes de tabelas/constraints/mensagens do Postgres ao cliente).
 */
export function handleError(err: unknown): Response {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'Unauthorized' || msg === 'Missing Authorization header') {
    return errorResponse('Unauthorized', 401);
  }
  if (err instanceof SyntaxError) return errorResponse('Corpo da requisição inválido (JSON esperado)', 400);
  console.error(err);
  return errorResponse('Erro interno do servidor', 500);
}
