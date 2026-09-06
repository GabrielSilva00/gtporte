import { useCallback, useEffect, useState } from 'react'
import { supabase, erroMsg } from '@/lib/supabase'

// ---- Types ----
export type SituacaoOp = 'aguardando'|'em_rota'|'concluida'
export interface RotaMot { rota_id:string; codigo:string; nome:string; horario_partida:string; horario_retorno:string; status:string; situacao_operacional:SituacaoOp; motorista_id:string; origem:string|null; destino:string|null; placa:string; modelo:string; capacidade_maxima:number; passageiros:number }
export interface Pax { alocacao_id:string; estudante_id:string; nome:string; prontuario:string; curso:string|null; universidade:string|null; perfil_uso:string; confirmou_ida:boolean; hora_ida:string|null; confirmou_volta:boolean; hora_volta:string|null }
export interface Aviso { id:string; rota_id:string; mensagem:string; criado_em:string }
export interface Msg { id:string; remetente_id:string|null; destinatario_id:string|null; assunto:string; corpo:string; lida:boolean; criado_em:string; remetente?:{nome:string}|null }
export interface SolVolta { id:string; alocacao_id:string; rota_id:string; data:string; justificativa:string; status:string; criado_em:string; estudante_nome?:string }

export const ROTULO_SIT: Record<SituacaoOp,string> = { aguardando:'Aguardando', em_rota:'Em rota', concluida:'Concluída' }
export const COR_SIT: Record<SituacaoOp,string> = { aguardando:'bg-amber-500/20 text-amber-400', em_rota:'bg-emerald-500/20 text-emerald-400', concluida:'bg-blue-500/20 text-blue-400' }

// ---- Hooks ----
export function useRotas() {
  const [rotas,setRotas] = useState<RotaMot[]>([]); const [loading,setLoading] = useState(true)
  const refresh = useCallback(async()=>{ setLoading(true); const {data}=await supabase.from('vw_minhas_rotas_motorista').select('*'); setRotas((data as RotaMot[])||[]); setLoading(false) },[])
  useEffect(()=>{refresh()},[refresh]); return {rotas,loading,refresh}
}

export function usePassageiros(rotaId:string|null) {
  const [pax,setPax]=useState<Pax[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{ if(!rotaId)return; setLoading(true); const hoje=new Date().toISOString().slice(0,10); const {data}=await supabase.rpc('passageiros_da_rota',{p_rota_id:rotaId,p_data:hoje}); setPax((data as Pax[])||[]); setLoading(false)},[rotaId])
  useEffect(()=>{refresh()},[refresh]); return {pax,loading,refresh}
}

export function useAvisos(rotaId:string|null) {
  const [avisos,setAvisos]=useState<Aviso[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{ if(!rotaId)return; setLoading(true); const {data}=await supabase.from('aviso_rota').select('*').eq('rota_id',rotaId).order('criado_em',{ascending:false}).limit(20); setAvisos((data as Aviso[])||[]); setLoading(false)},[rotaId])
  useEffect(()=>{refresh()},[refresh])
  const enviar=async(msg:string)=>{ if(!rotaId)return; const{error}=await supabase.from('aviso_rota').insert({rota_id:rotaId,mensagem:msg}); if(error)throw new Error(erroMsg(error)); await refresh() }
  const excluir=async(id:string)=>{ const{error}=await supabase.from('aviso_rota').delete().eq('id',id); if(error)throw new Error(erroMsg(error)); await refresh() }
  return {avisos,loading,enviar,excluir}
}

export function useMensagens() {
  const [msgs,setMsgs]=useState<Msg[]>([]); const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{ setLoading(true); const {data:{user}}=await supabase.auth.getUser(); if(!user){setLoading(false);return}; const {data}=await supabase.from('mensagem').select('*,remetente:remetente_id(nome)').or(`remetente_id.eq.${user.id},destinatario_id.eq.${user.id}`).order('criado_em',{ascending:false}).limit(50); setMsgs((data as Msg[])||[]); setLoading(false)},[])
  useEffect(()=>{refresh()},[refresh])
  const enviar=async(assunto:string,corpo:string)=>{ const{error}=await supabase.from('mensagem').insert({assunto,corpo}); if(error)throw new Error(erroMsg(error)); await refresh() }
  const marcarLida=async(id:string)=>{ await supabase.from('mensagem').update({lida:true}).eq('id',id); await refresh() }
  return {msgs,loading,enviar,marcarLida,refresh}
}

export function useSolicitacoesVolta(rotaId:string|null) {
  const [sol,setSol]=useState<SolVolta[]>([]); const [loading,setLoading]=useState(false)
  const refresh=useCallback(async()=>{ if(!rotaId)return; setLoading(true); const hoje=new Date().toISOString().slice(0,10); const {data}=await supabase.from('solicitacao_volta').select('*').eq('rota_id',rotaId).eq('data',hoje).order('criado_em',{ascending:false}); setSol((data as SolVolta[])||[]); setLoading(false)},[rotaId])
  useEffect(()=>{refresh()},[refresh])
  const decidir=async(id:string,aprov:boolean,motivo?:string)=>{ const{error}=await supabase.rpc(aprov?'aprovar_solicitacao_volta':'recusar_solicitacao_volta',{p_solicitacao_id:id,...(motivo?{p_motivo:motivo}:{})}); if(error)throw new Error(erroMsg(error)); await refresh() }
  return {sol,loading,decidir}
}

export async function atualizarSituacao(rotaId:string, sit:SituacaoOp) { const{error}=await supabase.rpc('atualizar_situacao_rota',{p_rota_id:rotaId,p_situacao:sit}); if(error)throw new Error(erroMsg(error)) }
export async function registrarGPS(rotaId:string, lat:number, lng:number) { try { await supabase.from('localizacao_rota').insert({rota_id:rotaId,latitude:lat,longitude:lng}) } catch {} }
