-- ============================================================================
-- Pagao — Limpieza de los datos que dejan las pruebas
-- ============================================================================
-- Pegar en Supabase Studio → SQL Editor → Run.
--
-- Correr esto ANTES de abrir la app a comerciantes reales: las suites dejan
-- cédulas inventadas con score en la Red Pagao, y un bodeguero que consulte
-- una de ellas vería un puntaje falso.
--
-- Es seguro repetirlo. No toca ninguna cuenta que no sea de prueba.
-- ============================================================================


-- ---- 1. Ver qué se va a borrar (opcional, corre esto primero) ---------------
select 'comerciantes de prueba' as que, count(*) as cuantos
  from auth.users
 where email like 'pagao.test.%@pagaotest.com'
    or email like 'pagao.prueba.%@pagaotest.com'
    or email like 'pagao.abonos.%@pagaotest.com'
    or email like 'pagao.edit.%@pagaotest.com'
    or email like 'pagao.mira.%@pagaotest.com'
union all
select 'deudores inventados', count(*)
  from debtors
 where cedula ~ '^V[0-9]{9}$'
   and id not in (
     select debtor_id from debts
      where merchant_id in (
        select id from merchants
         where id not in (
           select id from auth.users where email like '%@pagaotest.com'
         )
      )
   );


-- ---- 2. Borrar los comerciantes de prueba ----------------------------------
-- Se llevan en cascada sus fiados, abonos, fichas de cliente e historial.
delete from auth.users
 where email like '%@pagaotest.com';


-- ---- 3. Barrer los deudores que quedaron huérfanos --------------------------
-- Los deudores no cuelgan de ningún usuario: al borrar a los comerciantes de
-- prueba, sus clientes inventados se quedan flotando en la red con su score.
-- Solo se borran los que ya no tienen NINGUNA deuda de nadie.
delete from debtors
 where id not in (select distinct debtor_id from debts);


-- ---- 4. Comprobar que quedó limpio -----------------------------------------
select 'comerciantes' as tabla, count(*) as filas from merchants
union all select 'deudores', count(*) from debtors
union all select 'fiados',   count(*) from debts
union all select 'abonos',   count(*) from payments;
