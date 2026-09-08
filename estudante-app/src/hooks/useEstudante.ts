import { useCallback, useEffect, useState } from 'react'
import { supabase, erroMsg } from '@/lib/supabase'

export type PerfilUso='ida_volta'|'somente_ida'|'somente_volta'
export type StatusDoc='pendente'|'aprovado'|'rejeitado'
export type TipoDoc='rg'|'cpf'|'matricula'|'residencia'
export type SolStatus='pendente'|'aprovada'|'recusada'|'cancelada'

export const ROTULO_DOC:Record<TipoDoc,string>={rg:'RG',cpf:'CPF',matricula:'Comprovante de matricula',residencia:'Comprovante de residencia'}
export const TIPOS_DOC:TipoDoc[]=['rg','cpf','matricula','residencia']
export const ROTULO_PERFIL:Record<PerfilUso,string>={ida_volta:'Ida e volta',somente_ida:'Somente ida',somente_volta:'Somente volta'}

export interface MinhaRota {
  estudante:{id:string;nome:string;prontuario:string;curso:string|null;perfil_uso:PerfilUso;status_documental:StatusDoc;universidade:string|null}
  alocacao:{id:string;situacao:string;origem:string|null;motivo:string|null}|null
  rota:{id:string;codigo:string;nome:string;horario_partida:string;horario_retorno:string;status:string;situacao_operacional:string;origem:string|null;destino:string|null;motorista:string|null;motorista_telefone:string|null;veiculo:string|null;veiculo_modelo:string|null;capacidade:number|null}|null
  presenca_hoje:{confirmou_ida:boolean;hora_ida:string|null;confirmou_volta:boolean;hora_volta:string|null}|null
  solicitacao_volta:{id:string;status:SolStatus;justificativa:string;motivo_recusa:string|null}|null
}

export interface Documento { id:string;estudante_id:string;tipo:TipoDoc;nome_arquivo:string;storage_path:string;status:StatusDoc;observacao:string|null;criado_em:string }
export interface AvisoRota { id:string;rota_id:string;mensagem:string;criado_em:string }

export function useMinhaRota(){
  const [rota,setRota]=useState<MinhaRota|null>(null);const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{setLoading(true);const{data}=await supabase.rpc('minha_rota');setRota(data as MinhaRota|null);setLoading(false)},[])
  useEffect(()=>{refresh();const iv=setInterval(refresh,60000);return()=>clearInterval(iv)},[refresh])
  return {rota,loading,refresh}
}

export function useAvisos(rotaId:string|null){
  const [avisos,setAvisos]=useState<AvisoRota[]>([])
  useEffect(()=>{if(!rotaId)return;(async()=>{const{data}=await supabase.from('aviso_rota').select('*').eq('rota_id',rotaId).order('criado_em',{ascending:false}).limit(10);setAvisos((data as AvisoRota[])||[])})()},[rotaId])
  return avisos
}

export function useDocumentos(estudanteId:string|null){
  const [docs,setDocs]=useState<Documento[]>([]);const [loading,setLoading]=useState(true)
  const refresh=useCallback(async()=>{if(!estudanteId){setLoading(false);return};const{data}=await supabase.from('documento').select('*').eq('estudante_id',estudanteId);setDocs((data as Documento[])||[]);setLoading(false)},[estudanteId])
  useEffect(()=>{refresh()},[refresh])
  const enviar=async(tipo:TipoDoc,arquivo:File)=>{
    if(!estudanteId)throw new Error('Cadastro nao encontrado')
    const ext=arquivo.name.split('.').pop()?.toLowerCase()||'pdf'
    const path=`${estudanteId}/${tipo}-${Date.now()}.${ext}`
    const{error:upErr}=await supabase.storage.from('documentos').upload(path,arquivo,{upsert:true})
    if(upErr)throw new Error(erroMsg(upErr))
    const existente=docs.find(d=>d.tipo===tipo)
    if(existente){await supabase.from('documento').update({nome_arquivo:arquivo.name,storage_path:path,status:'pendente' as const,observacao:null}).eq('id',existente.id)}
    else{await supabase.from('documento').insert({estudante_id:estudanteId,tipo,nome_arquivo:arquivo.name,storage_path:path,status:'pendente'})}
    await refresh()
  }
  return {docs,loading,refresh,enviar}
}

export async function confirmarPresenca(trecho:'ida'|'volta'){
  const hoje=new Date().toISOString().slice(0,10)
  const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sessao expirada')
  const{data:est}=await supabase.from('estudante').select('id').eq('perfil_id',user.id).maybeSingle();if(!est)throw new Error('Cadastro nao encontrado')
  const{error}=await supabase.rpc('confirmar_presenca',{p_estudante_id:est.id,p_trecho:trecho,p_data:hoje});if(error)throw new Error(erroMsg(error))
}

export async function cancelarPresenca(trecho:'ida'|'volta',motivo:string){
  const hoje=new Date().toISOString().slice(0,10)
  const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sessao expirada')
  const{data:est}=await supabase.from('estudante').select('id').eq('perfil_id',user.id).maybeSingle();if(!est)throw new Error('Cadastro nao encontrado')
  const{error}=await supabase.rpc('cancelar_presenca',{p_estudante_id:est.id,p_trecho:trecho,p_motivo:motivo,p_data:hoje});if(error)throw new Error(erroMsg(error))
}

export async function solicitarVolta(justificativa:string){
  const{error}=await supabase.rpc('solicitar_volta',{p_justificativa:justificativa});if(error)throw new Error(erroMsg(error))
}
