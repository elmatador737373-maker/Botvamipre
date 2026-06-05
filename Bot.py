import os
import threading
from flask import Flask
import discord
from discord.ext import commands
from google import genai
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK (Anti-Sleep Render)
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Il segretario è online e attivo!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

ai_client = genai.Client(api_key=GEMINI_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# IMPORTANTE: Inserisci il tuo ID Utente Discord reale qui
IL_MIO_ID_DISCORD = 123456789012345678  

@bot.event
async def on_ready():
    print(f'Segretario pronto! Loggato come {bot.user.name}')

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    # Controlla se l'autore del messaggio sei TU (il Capo)
    sono_il_capo = message.author.id == IL_MIO_ID_DISCORD

    # ==========================================
    # FUNZIONE SPECIALE: RIASSUNTO GENERALE PER IL CAPO
    # ==========================================
    # Se il Capo tagga il bot chiedendo un riassunto o aggiornamenti
    testo_minuscolo = message.content.lower()
    parole_chiave = ["riassunto", "riassumi", "novità", "successo", "aggiornamento", "report"]
    
    if tagga_bot and sono_il_capo and any(parola in testo_minuscolo for palabra in parole_chiave):
        async with message.channel.typing():
            await message.reply("Certamente Capo. Sto controllando tutte le chat nei server in cui sono presente per farle un resoconto. Attenda un attimo...")
            
            cronologia_totale = ""
            
            # Il bot gira per TUTTI i server (guilds) in cui si trova
            for server in bot.guilds:
                cronologia_totale += f"\n--- SERVER: {server.name} ---\n"
                
                # Gira per tutti i canali di testo di quel server
                for canale in server.text_channels:
                    # Controlla se il bot ha i permessi per leggere la chat
                    permessi = canale.permissions_for(server.me)
                    if permessi.read_messages and permessi.read_message_history:
                        try:
                            cronologia_totale += f"\n[Canale: #{canale.name}]\n"
                            # Recupera gli ultimi 20 messaggi del canale (puoi aumentare a 30 o 40 se vuoi)
                            async for msg in canale.history(limit=20, oldest_first=False):
                                # Salta i messaggi del bot stesso per evitare confusione
                                if msg.author != bot.user:
                                    cronologia_totale += f"{msg.author.display_name}: {msg.clean_content}\n"
                        except Exception:
                            continue # Salta il canale se ci sono errori di lettura
            
            # Se non ha trovato messaggi
            if not cronologia_totale.strip():
                await message.reply("Capo, ho controllato ma non ho trovato nessuna discussione recente nei canali a cui ho accesso.")
                return

            try:
                # Chiediamo a Gemini di fare il super riassunto diviso per server e canali
                prompt_riassunto = (
                    "Sei Jarvis, il segretario personale. Ti viene data in pasto la cronologia recente di diversi canali e server Discord. "
                    "Il tuo compito è fare un riassunto dettagliato, chiaro e super organizzato per il tuo Capo. "
                    "Evidenzia i punti salienti, di cosa hanno parlato gli utenti, se ci sono problemi o novità importanti. "
                    "Dividi il report per Server e per Canale usando i titoli in Markdown (es. ## Nome Server). "
                    "Sii formale e dagli del 'Lei'."
                )

                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=f"Ecco la cronologia delle chat:\n\n{cronologia_totale}",
                    config={"system_instruction": prompt_riassunto}
                )
                
                # Discord ha un limite di 2000 caratteri per messaggio. 
                # Se il riassunto è troppo lungo, lo spezziamo in più parti.
                risposta = response.text
                if len(risposta) > 1900:
                    for i in range(0, len(risposta), 1900):
                        await message.author.send(risposta[i:i+1900])
                    await message.reply("Capo, le ho inviato il report completo dettagliato nei suoi Messaggi Privati per non intasare questa chat.")
                else:
                    await message.reply(f"Ecco il resoconto richiesto, Capo:\n\n{risposta}")
                
            except Exception as e:
                print(f"Errore riassunto: {e}")
                await message.reply("Mi scusi Capo, c'è stato un errore nel generare il riassunto dei canali.")
        return

    # ==========================================
    # LOGICA STANDARD (Risposta se taggano te o il bot)
    # ==========================================
    if tagga_bot or tagga_me or in_dm:
        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        if not clean_content:
            if tagga_me:
                await message.reply(f"Salve! Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me. Come posso aiutarla?")
            else:
                await message.reply("Desidera qualcosa? Sono a sua disposizione.")
            return

        async with message.channel.typing():
            try:
                istruzione_sistema = (
                    f"Sei il segretario personale dell'utente <@{IL_MIO_ID_DISCORD}>. "
                    "Il tuo compito è assistere le persone quando lui viene taggato o non è disponibile. "
                    "Sii estremamente educato, formale e organizzato. Dai del 'Lei'."
                )

                response = ai_client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=clean_content,
                    config={"system_instruction": istruzione_sistema}
                )
                
                if tagga_me:
                    risposta_finale = (
                        f"💼 *Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto parli con me.*\n\n"
                        f"{response.text}\n\n"
                        f"*Provvederò comunque a riferire il tutto appena sarà disponibile.*"
                    )
                else:
                    risposta_finale = response.text

                await message.reply(risposta_finale)
                
            except Exception as e:
                print(f"Errore IA: {e}")
                await message.reply("La prego di scusarmi, ho riscontrato un'anomalia nei miei sistemi.")

    await bot.process_commands(message)

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
