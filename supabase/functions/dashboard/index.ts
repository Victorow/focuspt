import { handleCors, jsonResponse, errorResponse, handleError } from '../_shared/cors.ts';
import { getAuthUser } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

    const { client } = await getAuthUser(req);

    // pt_id é derivado de auth.uid() dentro da função (evita IDOR)
    const { data, error } = await client.rpc('get_dashboard_stats');
    if (error) throw error;

    return jsonResponse(data);
  } catch (err) {
    return handleError(err);
  }
});
