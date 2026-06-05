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
    return "Jarvis con IA-DM Intelligente è Online!"

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
IL_MIO_ID_DISCORD = 1191824316376043580  

conversazioni_attive = {}
memoria_chat = {}

@bot.event
async def on_ready():
    print(f'✨ Jarvis (IA-DM Intelligente) è online come {bot.user.name}')

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

    # SBLOCCO ASCOLTO SE TAGGANO IL CAPO
    if tagga_me and not ha_sessione_attiva:
        conversazioni_attive[user_id] = True
        ha_sessione_attiva = True

    # VERIFICA SE RISPONDERE
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        # Pulizia preliminare dei tag principali
        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        testo_minuscolo = clean_content.lower()
        
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                if is_capo:
                    await message.reply("💼 Eccomi Capo, ha bisogno di me? *(Parli pure senza tag, dica 'stop' per chiudere)*")
                else:
                    await message.reply(f"💼 Ciao! Il mio capo potrebbe essere impegnato. Dimmi pure! *(Risponderò senza tag, scrivi 'stop' per chiudere)*")
            else:
                if is_capo:
                    await message.reply("📝 Sono ai Suoi ordini, Capo. Mi dica tutto. *(Scriva 'stop' per chiudere)*")
                else:
                    await message.reply("📝 Ciao! Sono a tua disposizione. Dimmi pure. *(Scrivi 'stop' per chiudere)*")
            return

        if not clean_content:
            return

        if message.content.startswith("!"):
            await bot.process_commands(message)
            return

        async with message.channel.typing():
            try:
                # --------------------------------------------------------
                # INTERCETTAZIONE ORDINE DM INTELLIGENTE (Genera testo bello)
                # --------------------------------------------------------
                ha_richiesto_dm = "dm" in re.findall(r'\b\w+\b', testo_minuscolo)
                
                if ha_richiesto_dm:
                    if not is_capo:
                        await message.reply("❌ **Accesso Negato.** Eseguo l'invio di comunicazioni riservate solo sotto diretto ordine del mio **Capo**.")
                        return
                    
                    altre_menzioni = [u for u in message.mentions if u.id != bot.user.id and u.id != IL_MIO_ID_DISCORD]
                    
                    if not altre_menzioni:
                        await message.reply("💼 **Capo, se desidera inviare un DM, deve includere il tag dell'utente** (es: `dm @NomeUtente messaggio`).")
                        return
                    
                    target_utente = altre_menzioni[0]
                    
                    # Isoliamo la tua bozza o le tue istruzioni di testo
                    istruzioni_messaggio = message.content
                    istruzioni_messaggio = istruzioni_messaggio.replace(f'<@{bot.user.id}>', '')
                    istruzioni_messaggio = istruzioni_messaggio.replace(f'<@{target_utente.id}>', '')
                    istruzioni_messaggio = istruzioni_messaggio.replace(f'<@!{target_utente.id}>', '')
                    istruzioni_messaggio = re.sub(r'\bdm\b', '', istruzioni_messaggio, flags=re.IGNORECASE)
                    istruzioni_messaggio = istruzioni_messaggio.strip(",:; ").strip()

                    if not istruzioni_messaggio:
                        await message.reply("💼 **Capo, qual è l'oggetto o il testo del messaggio da elaborare?** Riscriva includendo il concetto.")
                        return

                    try:
                        # 🧠 Sfruttiamo l'IA per trasformare la tua bozza in un messaggio magnifico
                        prompt_creazione_dm = (
                            f"Sei Jarvis, l'impeccabile e raffinato segretario di <@{IL_MIO_ID_DISCORD}>.\n"
                            f"Il tuo Capo ti ha ordinato di scrivere un messaggio privato a {target_utente.name}.\n"
                            f"Ecco le istruzioni/bozza del Capo: '{istruzioni_messaggio}'\n\n"
                            "IL TUO COMPITO:\n"
                            "- Genera il testo finale del messaggio che l'utente riceverà in DM.\n"
                            "- Trasforma gli appunti del Capo in un testo fluido, elegante, chiaro ed estremamente professionale.\n"
                            "- Chi riceve il messaggio deve ricevere del 'tu' (è un utente comune), ma il messaggio deve avere lo stile impeccabile di Jarvis (usa **grassetti** per i punti chiave, elenchi se necessario ed emoji azzeccate).\n"
                            "- Specifica chiaramente all'inizio o alla fine che il messaggio viene recapitato per conto del tuo Capo.\n"
                            "- Restituisci SOLO E SOLTANTO il testo finale del messaggio pronto da inviare, senza scuse o commenti per il Capo."
                        )

                        completamento_dm = ai_client.chat.completions.create(
                            model="llama-3.1-8b-instant",
                            messages=[{"role": "user", "content": prompt_creazione_dm}],
                            temperature=0.7
                        )
                        
                        messaggio_bello_ia = completamento_dm.choices[0].message.content

                        # Spediamo il capolavoro in DM all'utente
                        await target_utente.send(messaggio_bello_ia)
                        
                        # Mostriamo al Capo un'anteprima del testo inviato
                        await message.reply(
                            f"✨ **Ordine eseguito con successo, Capo.** Ho elaborato il testo e inviato il seguente messaggio a {target_utente.mention} in totale riservatezza:\n\n"
                            f"📝 *Anteprima inviata:*\n{messaggio_bello_ia}"
                        )
                        return
                        
                    except discord.Forbidden:
                        await message.reply(f"⚠️ **Insuccesso, Capo.** L'utente {target_utente.mention} blocca i DM generati dai server esterni.")
                        return
                    except Exception as e:
                        await message.reply(f"❌ **Errore nell'elaborazione/invio del DM:** `{str(e)}`")
                        return

                # --------------------------------------------------------
                # INTERCETTAZIONE ORDINE DI RIASSUNTO
                # --------------------------------------------------------
                parole_chiave_riassunto = ["fammi un riassunto", "fai un riassunto", "riassumi gli ultimi", "riassunto dei messaggi"]
                ha_richiesto_riassunto = any(chiave in testo_minuscolo for chiave in parole_chiave_riassunto)
                
                if ha_richiesto_riassunto:
                    if in_dm:
                        await message.reply("💼 Capo, mi trovo in una chat privata con Lei. Non posso effettuare il riepilogo di un canale server da qui.")
                        return
                    
                    cronologia_canale = []
                    async for msg_storico in message.channel.history(limit=35):
                        if msg_storico.id != message.id and msg_storico.author != bot.user and not msg_storico.content.startswith("!"):
                            cronologia_canale.append(f"{msg_storico.author.name}: {msg_storico.content}")
                    
                    cronologia_canale.reverse()
                    
                    if not cronologia_canale:
                        await message.reply("💼 Non ho trovato messaggi recenti da analizzare in questo canale, Capo.")
                        return
                    
                    testo_cronologia = "\n".join(cronologia_canale)
                    
                    istruzione_riassunto = (
                        f"Sei Jarvis, l'impeccabile segretario di <@{IL_MIO_ID_DISCORD}>. Ti è stato chiesto di fare un riassunto degli ultimi messaggi del canale.\n"
                        "Genera un riepilogo chiaro, organizzato in punti strutturati (bullet points), usando grassetti ed emoji.\n"
                        "Il tono deve essere formale e devoto ('Lei') se a chiederlo è il tuo Capo, o amichevole ('tu') se è un utente comune."
                    )
                    
                    input_ia_riassunto = f"Ecco la cronologia recente del canale. Riassumila evidenziando i punti salienti, chi ha detto cosa e le decisioni prese:\n\n{testo_cronologia}"
                    
                    completion = ai_client.chat.completions.create(
                        model="llama-3.1-8b-instant",
                        messages=[
                            {"role": "system", "content": istruzione_riassunto},
                            {"role": "user", "content": input_ia_riassunto}
                        ],
                        temperature=0.5
                    )
                    
                    await message.reply(f"📊 **Ecco il resoconto richiesto dei messaggi recenti:**\n\n{completion.choices[0].message.content}")
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
                        "- Usa la formattazione di Discord: **grassetti** ed emoji professionali (💼, ✨).\n"
                        "- Ricorda perfettamente i dettagli scambiati nei messaggi precedenti della chat attuale."
                    )
                else:
                    istruzione_sistema = (
                        f"Sei Jarvis, l'efficiente segretario personale di <@{IL_MIO_ID_DISCORD}>.\n"
                        f"Stai parlando con un UTENTE COMUNE (NON è il tuo capo).\n\n"
                        "REGOLE:\n"
                        "- Dai del 'TU' all'interlocutore, sii amichevole, giovanile e alla mano.\n"
                        "- Lavori solo per il tuo capo, sii fiero di questo.\n"
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

                # GESTIONE BANNER GRAFICI
                if tagga_me and not is_capo and message.content.startswith(f"<@{IL_MIO_ID_DISCORD}>"):
                    risposta_finale = (
                        f"💼 **Il mio capo potrebbe essere impegnato, intanto rispondo io!**\n"
                        f"*(Risponderò ai tuoi messaggi successivi senza bisogno di tag. Scrivi 'stop' per terminare)*\n\n"
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
