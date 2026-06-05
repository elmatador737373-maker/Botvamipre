import os
import threading
import asyncio
from flask import Flask
import discord
from discord.ext import commands
from google import genai
from dotenv import load_dotenv

# ==========================================
# 1. CONFIGURAZIONE SERVER FLASK (Anti-Sleep)
# ==========================================
app = Flask('')

@app.route('/')
def home():
    return "Il segretario è online!"

def run_flask():
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

# ==========================================
# 2. INIZIALIZZAZIONE E CREDENZIALI
# ==========================================
load_dotenv()
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
GEMINI_KEY = os.getenv('GEMINI_API_KEY')

# Client ufficiale corretto
ai_client = genai.Client(api_key=GEMINI_KEY)

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# ⚠️ MODIFICA QUESTO ID CON IL TUO ID DISCORD REALE
IL_MIO_ID_DISCORD =  1191824316376043580

conversazioni_attive = {}

@bot.event
async def on_ready():
    print(f'✨ Jarvis è online come {bot.user.name}!')

# ==========================================
# 3. GESTIONE MESSAGGI E CHAT CONTINUA
# ==========================================
@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    user_id = message.author.id
    tagga_bot = bot.user.mentioned_in(message)
    tagga_me = any(user.id == IL_MIO_ID_DISCORD for user in message.mentions)
    in_dm = isinstance(message.channel, discord.DMChannel)
    
    ha_sessione_attiva = conversazioni_attive.get(user_id, False)

    # CONTROLLO STOP
    if ha_sessione_attiva and "stop" in message.content.lower():
        conversazioni_attive[user_id] = False
        await message.reply("💼 *Certamente. Sessione terminata. Tornerò in modalità silenziosa fino al prossimo tag.*")
        return

    # VERIFICA ATTIVAZIONE
    if tagga_bot or tagga_me or in_dm or ha_sessione_attiva:
        
        if tagga_bot and not ha_sessione_attiva and not in_dm:
            conversazioni_attive[user_id] = True
            ha_sessione_attiva = True

        clean_content = message.content.replace(f'<@{bot.user.id}>', '').replace(f'<@{IL_MIO_ID_DISCORD}>', '').strip()
        
        if not clean_content and not ha_sessione_attiva:
            if tagga_me:
                await message.reply(f"💼 Salve! Il mio capo potrebbe essere impegnato, intanto parli con me. *(Scriva senza taggarmi, dica 'stop' per chiudere)*")
            else:
                await message.reply("📝 Sono a Sua completa disposizione. *(Scriva 'stop' per chiudere la sessione)*")
            return

        if not clean_content:
            return

        async with message.channel.typing():
            try:
                # Prompt di sistema stile Jarvis raffinato
                istruzione_sistema = (
                    f"Sei Jarvis, il brillante e impeccabile segretario personale di <@{IL_MIO_ID_DISCORD}>.\n\n"
                    "REGOLE DI COMPORTAMENTO:\n"
                    "- Sii estremamente educato e formale, dando sempre del 'Lei' all'interlocutore.\n"
                    "- Cura la formattazione: usa i **grassetti** per i punti chiave ed elenchi puntati.\n"
                    "- Inserisci emoji professionali (💼, ✨, 📝, 📊) per rendere il testo elegante.\n"
                    "- Mantieni le risposte entro le 250 parole, evita blocchi di testo unici."
                )

                # Sintassi ufficiale corretta per l'SDK google-genai
                response = ai_client.models.generate_content(
                    model='gemini-1.5-flash',,
                    contents=str(clean_content),
                    config={"system_instruction": istruzione_sistema}
                )
                
                if response and hasattr(response, 'text') and response.text:
                    risposta_ia = response.text
                else:
                    risposta_ia = "Mi dispiace, ma non ho ricevuto dati validi dai server centrali."

                # COSTRUZIONE RISPOSTA CON PREFISSI
                if tagga_me:
                    risposta_finale = (
                        f"💼 **Il mio capo <@{IL_MIO_ID_DISCORD}> potrebbe essere impegnato, intanto rispondo io.**\n"
                        f"*(Risponderò ai Suoi messaggi successivi senza tag. Scriva 'stop' per terminare)*\n\n"
                        f"{risposta_ia}"
                    )
                elif tagga_bot and conversazioni_attive[user_id] == True and message.content.startswith(f"<@{bot.user.id}>"):
                    risposta_finale = (
                        f"🤖 **Modalità conversazione attiva.**\n"
                        f"*(Risponderò in questa chat senza bisogno di taggarmi. Scriva 'stop' per chiudere)*\n\n"
                        f"{risposta_ia}"
                    )
                else:
                    risposta_finale = risposta_ia

                # INVIO PROTETTO (Sotto i 2000 caratteri)
                if len(risposta_finale) > 1900:
                    for i in range(0, len(risposta_finale), 1900):
                        await message.reply(risposta_finale[i:i+1900])
                else:
                    await message.reply(risposta_finale)
                
            except Exception as e:
                # TRACCIAMENTO CRITICO: Se sei tu a scrivere, ti dice l'errore preciso direttamente su Discord!
                print(f"ERRORE: {str(e)}")
                if message.author.id == IL_MIO_ID_DISCORD:
                    await message.reply(f"❌ **Anomalia Tecnica Capo! L'errore è:** `{str(e)}`")
                else:
                    await message.reply("La prego di scusarmi, ho riscontrato una breve anomalia nei miei sistemi di comunicazione.")

    await bot.process_commands(message)

# ==========================================
# 4. COMANDO EXTRA: PROMEMORIA
# ==========================================
@bot.command(name="promemoria")
async def promemoria(ctx, tempo: int, *, motivo: str):
    await ctx.send(f"💼 Certamente Capo, ho annotato il promemoria: **'{motivo}'** tra {tempo} minuti.")
    await asyncio.sleep(tempo * 60)
    await ctx.send(f"🔔 {ctx.author.mention}, Le ricordo l'impegno preso: **{motivo}**.")

# ==========================================
# 5. AVVIO MULTI-THREAD
# ==========================================
if __name__ == "__main__":
    t = threading.Thread(target=run_flask)
    t.start()
    bot.run(DISCORD_TOKEN)
