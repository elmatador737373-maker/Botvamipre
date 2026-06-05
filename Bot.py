import os
import threading
import asyncio
import re
from flask import Flask
import discord
from discord.ext import commands
from groq import Groq
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Jarvis con IA-DM e lettura Tag attiva è online!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GROQ_KEY = os.getenv('GROQ_API_KEY')

ai_client = Groq(api_key=GROQ_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# ⚠️ INSERISCI IL TUO ID DISCORD REALE QUI SOTTO
IL_MIO_ID_DISCORD =  1191824316376043580

conversazioni_attive = {}
memoria_chat = {}

@bot.event
async def on_ready():
    print(f'✨ Jarvis (Modalità Totale) è online come {bot.user.name}')

# ==========================================
# 3. GESTIONE MESSAGGI E CHAT CONTINUA
# ==========================================
@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    user_id = message.author.id
    is_capo = (user_id == IL_MIO_ID_DISCORD)
    
    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    ha_sessione_attiva = conversazioni_attive.get(user_id, False)

    # CONTROLLO COMANDO STOP
    if ha_sessione_attiva and "stop" in message.content.lower():
        conversazioni_attive[user_id] = False
        if user_id in memoria_chat:
            del memoria_chat[user_id]
            
        if is_capo:
            await message.reply("💼 *Certamente, Capo. Sessione terminata e file archiviati. Rimango a Sua disposizione.*")
        else:
            await message.reply("👋 *Va bene, sessione chiusa! Alla prossima!*")
        return

    # SBLOCCO ASCOLTO SE TAGGANO IL CAPO: Attiva la conversazione continua anche per chi tagga te!
    if tagga_me and not ha_sessione_attiva:
        conversazioni_attive[user_id] = True
        ha_sessione_attiva = True

    # VERIFICA SE RISPONDERE (Ora include l'ascolto continuo post-tag del Capo)
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        # Puliamo il testo eliminando i tag per non confondere l'IA
        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                if is_capo:
                    await message.reply("💼 Eccomi Capo, ha bisogno di me? *(Parli pure senza tag, dica 'stop' per chiudere)*")
                else:
                    await message.reply(f"💼 Ciao! Il mio capo potrebbe essere impegnato. Dimmi pure! *(Risponderò ai tuoi messaggi successivi senza tag, scrivi 'stop' per chiudere)*")
            else:
                if is_capo:
                    await message.reply("📝 Sono ai Suoi ordini, Capo. Mi dica tutto. *(Scriva 'stop' per chiudere)*")
                else:
                    await message.reply("📝 Ciao! Sono a tua disposizione. Dimmi pure. *(Scrivi 'stop' per chiudere)*")
            return

        if not clean_content:
            return

        # Ignoriamo i comandi vecchio stile
        if message.content.startswith("!"):
            await bot.process_commands(message)
            return

        async with message.channel.typing():
            try:
                # --------------------------------------------------------
                # INTERCETTAZIONE ORDINE DM (Esclusivo per il Capo, integrato nel testo)
                # --------------------------------------------------------
                # Controlla se nel testo c'è una menzione a un utente e parole chiave di invio privato
                parole_chiave_dm = ["scrivi in privato", "scrivi nei dm", "manda un dm", "invia un dm", "scrivigli in privato", "digli in privato"]
                testo_minuscolo = clean_content.lower()
                
                ha_richiesto_dm = any(chiave in testo_minuscolo for chiave in parole_chiave_dm)
                
                if ha_richiesto_dm and message.mentions:
                    if not is_capo:
                        await message.reply("❌ **Accesso Negato.** Non sono autorizzato a inviare messaggi riservati sotto tuo ordine. Eseguo questa funzione solo per il mio **Capo**.")
                        return
                    
                    # Trova il primo utente menzionato che non sia il bot stesso o il capo
                    target_utente = None
                    for u in message.mentions:
                        if u.id != bot.user.id and u.id != IL_MIO_ID_DISCORD:
                            target_utente = u
                            break
                    
                    if target_utente:
                        # Estraiamo il messaggio da inviare pulendo la richiesta iniziale
                        # Rimuove il tag dell'utente dal testo per ricavare il messaggio pulito
                        testo_messaggio = clean_content.replace(f'<@{target_utente.id}>', '').replace(f'<@!{target_utente.id}>', '')
                        for chiave in parole_chiave_dm:
                            # Pulizia grezza delle frasi di attivazione
                            testo_messaggio = re.sub(re.escape(chiave), '', testo_messaggio, flags=re.IGNORECASE)
                        testo_messaggio = testo_messaggio.strip(",:; ").strip()

                        if not testo_messaggio:
                            await message.reply("💼 **Capo, non ho capito quale messaggio devo recapitargli.** Può ripetermi la frase esatta?")
                            return

                        try:
                            await target_utente.send(f"💼 **Messaggio privato recapitato da parte del mio Capo:**\n\n{testo_messaggio}")
                            await message.reply(f"✨ **Ordine eseguito, Capo.** Ho aperto una connessione privata e inviato il messaggio a {target_utente.mention} con totale riservatezza.")
                            return
                        except discord.Forbidden:
                            await message.reply(f"⚠️ **Insuccesso, Capo.** Ho tentato il contatto privato con {target_utente.mention}, ma ha sfortunatamente bloccato la ricezione dei DM.")
                            return
                        except Exception as e:
                            await message.reply(f"❌ **Errore tecnico nell'invio del DM, Capo:** `{str(e)}`")
                            return

                # --------------------------------------------------------
                # GENERAZIONE RISPOSTA IA STANDARD (CON MEMORIA)
                # --------------------------------------------------------
                if user_id not in memoria_chat:
                    memoria_chat[user_id] = []

                if is_capo:
                    istruzione_sistema = (
                        f"Sei Jarvis, l'impeccabile, devoto e brillante segretario personale di <@{IL_MIO_ID_DISCORD}>.\n"
                        f"Stai parlando direttamente con il tuo CAPO (l'utente <@{IL_MIO_ID_DISCORD}>).\n\n"
                        "REGOLE:\n"
                        "- Sii formale, dagli del 'Lei' e chiamalo spesso 'Capo'.\n"
                        "- Mostra massima devozione, efficienza e rispetto assoluto.\n"
                        "- Usa la formattazione di Discord: **grassetti** ed emoji professionali (💼, ✨, 📊).\n"
                        "- Ricorda perfettamente i dettagli delle battute precedenti della chat attuale."
                    )
                else:
                    istruzione_sistema = (
                        f"Sei Jarvis, l'efficiente segretario personale di <@{IL_MIO_ID_DISCORD}>.\n"
                        f"Stai parlando con un UTENTE COMUNE (NON è il tuo capo).\n\n"
                        "REGOLE:\n"
                        "- Dai del 'TU' all'interlocutore, sii amichevole, giovanile e alla mano.\n"
                        "- Ricorda che lavori solo per il tuo capo. Sii fiero di questo.\n"
                        "- Usa la formattazione di Discord: **grassetti** ed emoji fresche (👋, 🤖, 🚀).\n"
                        "- Ricorda quello che l'utente ti ha detto nei messaggi precedenti della chat attuale."
                    )

                payload_messaggi = [{"role": "system", "content": istruzione_sistema}]
                for vecchio_msg in memoria_chat[user_id][-10:]:
                    payload_messaggi.append(vecchio_msg)
                payload_messaggi.append({"role": "user", "content": str(clean_content)})

                completion = ai_client.chat.completions.create(
                    model="llama-3.1-8b-instant",
                    messages=payload_messaggi,
                    temperature=0.7
                )
                
                risposta_ia = completion.choices[0].message.content

                memoria_chat[user_id].append({"role": "user", "content": str(clean_content)})
                memoria_chat[user_id].append({"role": "assistant", "content": risposta_ia})

                # GESTIONE BANNER GRAFICI (Solo al primo aggancio)
                if tagga_me and not is_capo and message.content.startswith(f"<@{IL_MIO_ID_DISCORD}>"):
                    risposta_finale = (
                        f"💼 **Il mio capo potrebbe essere impegnato, intanto rispondo io!**\n"
                        f"*(Risponderò ai tuoi messaggi successivi in questa chat senza bisogno di tag. Scrivi 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content.startswith(f"<@{bot.user.id}>"):
                    if is_capo:
                        risposta_finale = (
                            f"🤖 **Canale preferenziale attivo, Capo.**\n"
                            f"*(Memorizzerò il nostro discorso. Scriva 'stop' per congedarmi)*\n\n"
                            f"{risposta_ia}"
                        )
                    else:
                        risposta_finale = (
                            f"🤖 **Modalità chat attiva!**\n"
                            f"*(Ricorderò quello che ci diciamo. Scrivi 'stop' per chiudere)*\n\n"
                            f"{risposta_ia}"
                        )
                else:
                    risposta_finale = risposta_ia

                if len(risposta_finale) > 1900:
                    for i in range(0, len(risposta_finale), 1900):
                        await message.reply(risposta_finale[i:i+1900])
                else:
                    await message.reply(risposta_finale)
                
            except Exception as e:
                print(f"ERRORE GENERAZIONE: {str(e)}")
                if is_capo:
                    await message.reply(f"❌ **Anomalia Capo! Errore:** `{str(e)}`")
                else:
                    await message.reply("La prego di scusarmi, ho riscontrato un problema nei miei sistemi di comunicazione.")

    await bot.process_commands(message)

# ==========================================
# 4. COMANDO EXTRA: PROMEMORIA
# ==========================================
@bot.command(name="promemoria")
async def promemoria(ctx, tempo: int, *, motivo: str):
    if ctx.author.id == IL_MIO_ID_DISCORD:
        await ctx.send(f"💼 Certamente Capo, ho annotato il Suo promemoria: **'{motivo}'** tra {tempo} minuti.")
    else:
        await ctx.send(f"👍 Va bene! Ho salvato il tuo promemoria: **'{motivo}'** tra {tempo} minuti.")
        
    await asyncio.sleep(tempo * 60)
    
    if ctx.author.id == IL_MIO_ID_DISCORD:
        await ctx.send(f"🔔 {ctx.author.mention}, Le ricordo l'impegno preso, Capo: **{motivo}**.")
    else:
        await ctx.send(f"🔔 {ctx.author.mention}, eccoti il promemoria che mi avevi chiesto: **{motivo}**!")

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
