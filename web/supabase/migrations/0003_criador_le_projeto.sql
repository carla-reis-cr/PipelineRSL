-- Quem cria o projeto precisa conseguir lê-lo já no INSERT ... RETURNING.
-- A política de leitura é conferida antes de o gatilho add_owner gravar o criador
-- em project_members, então is_member() ainda é falso nesse momento e o insert
-- era recusado com "new row violates row-level security policy".
drop policy "membros leem o projeto" on public.projects;
create policy "membros leem o projeto" on public.projects for select using (public.is_member(id) or created_by = auth.uid());
