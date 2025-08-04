export const POSITIONEN = ["TH","LV","RV","IV","ZDM","ZM","ZOM","LM","RM","LF","RF","ST"];
import { supabase } from './supabaseClient.js';

// Hinweis: Alle Daten werden jetzt über Supabase geladen – keine lokalen Initialdaten mehr!

// Lade alle Spieler eines Teams aus Supabase
export async function getPlayersByTeam(team) {
    const { data, error } = await supabase.from('players').select('*').eq('team', team);
    if (error) throw error;
    return data || [];
}

// Lade alle Ehemaligen (team === "Ehemalige")
export async function getEhemalige() {
    const { data, error } = await supabase.from('players').select('*').eq('team', "Ehemalige");
    if (error) throw error;
    return data || [];
}

// Lade alle bans
export async function getBans() {
    const { data, error } = await supabase.from('bans').select('*');
    if (error) throw error;
    return data || [];
}

// Lade alle Matches
export async function getMatches() {
    const { data, error } = await supabase.from('matches').select('*');
    if (error) throw error;
    return data || [];
}

// Lade alle Transaktionen
export async function getTransactions() {
    const { data, error } = await supabase.from('transactions').select('*');
    if (error) throw error;
    return data || [];
}

// Lade Finanzen (liefert beide Teams als Array)
export async function getFinances() {
    const { data, error } = await supabase.from('finances').select('*');
    if (error) throw error;
    return data || [];
}

// Lade SpielerDesSpiels-Statistik
export async function getSpielerDesSpiels() {
    const { data, error } = await supabase.from('spieler_des_spiels').select('*');
    if (error) throw error;
    return data || [];
}