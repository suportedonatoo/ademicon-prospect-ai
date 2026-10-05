import { z } from 'zod';
import { authed, body } from '@/lib/api';
import { deleteTraining, saveTraining, setCompleted } from '@/modules/training/training.service';

/** PATCH — editar (Super Admin) · POST { completed } — marcar como concluído · DELETE — remover (Super Admin). */
export const PATCH = authed<{ id: string }>({}, async ({ req, ctx, params }) => saveTraining(ctx, await body(req), params.id));
export const POST = authed<{ id: string }>({}, async ({ req, ctx, params }) => setCompleted(ctx, params.id, z.object({ completed: z.boolean() }).parse(await body(req)).completed));
export const DELETE = authed<{ id: string }>({}, async ({ ctx, params }) => deleteTraining(ctx, params.id));
