import { z } from 'zod';

export const unitSchema = z.object({
  id: z.string(), kind: z.enum(['title', 'section', 'paragraph']),
  markdown: z.string(), html: z.string(), label: z.string(), context: z.string(),
});
export type Unit = z.infer<typeof unitSchema>;
export const annotationSchema = z.object({
  number: z.number().int().positive(), kind: z.enum(['issue', 'pr']),
  title: z.string(), url: z.url().regex(/^https:\/\/github\.com\//u),
  targetId: z.string(),
});
export type Annotation = z.infer<typeof annotationSchema>;
export const indexSchema = z.object({
  version: z.literal(1), repository: z.string().regex(/^[\w.-]+\/[\w.-]+$/u),
  branch: z.string().min(1), documentPath: z.string().min(1),
  revision: z.string(), generatedAt: z.iso.datetime(),
  units: z.array(unitSchema), annotations: z.array(annotationSchema),
});
export type AnnotationIndex = z.infer<typeof indexSchema>;
export interface Comment { id: number; body: string; login: string }
export interface Edit { diff: string | null; editedAt: string; deletedAt: string | null }
export interface Item {
  number: number; kind: 'issue' | 'pr'; title: string; body: string;
  url: string; open: boolean; labels: string[]; comments: Comment[];
  discussion: string[]; edits: Edit[]; includesCreatedEdit: boolean; lastEditedAt: string | null; diff: string;
}
export interface Mapping { targetId: string | null; confidence: number; evidence: string; reason: string }
