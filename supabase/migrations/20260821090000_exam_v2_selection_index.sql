-- v2 bank selection support
create index if not exists questions_domain_difficulty_concept_idx
  on public.questions (is_active, domain, difficulty, concept_key);
