I want to design and build the fictional radio station broadcasting from the distance future. The idea is that all the radio DJs would be AI powered voices. My vision is that few key features must be there:
 1. Realistic world that have rich history and present. 
 2. New things are happening, events in many aspects of the live, medicine, politics, culture etc. 
 3. One of the most important! The spirit of the world is inspired by great sci-fi authors of the 20th century. Space travels, many planets, aliens. The world should not be too dark, I want to have a great balance between these ideas, ideals of how the scifi authors saw the distance future and the sense of reality, like the whole thing is real 
 4. Each AI DJ should have "personality", background, ways of talking, expressions. 
 5. I want to have all the attributes of real radio station. Music effects, jingels for types of programs, broadcust schedule, time table etc. 
 6. I want to support all major formats, news, interviews, culture, talk shows etc. Means only one person talks and many person talk under the show format. 
 7. The radio MUST BE time aware and aligned with the actual one. Example: if now in the real world is 22:30, 15 Nov. the radio would reference to the same time and day, just in the future, so DJs would always use the current day + time + the year from the distance future. 
 
 Now for the tech part. 
 1. We'd need a RAG system. Think about how embeddings will be created, how admin will add another ones, how the system will re-index the RAG 
 2. The tech stack should be with free to use tools, of low costs tools only. This menas the hosting, voice generation, LLM model to generate the texts, broadcast software etc should be free or low costs. 
 3. Need to have LLM model the working the best with the conversation generations (latest verision of haiku with API access should work, please confirm) 
 4. Need to have an administration to manage the world, add events, change timetable etc, manage programs, manage DJs 
 5. All the content the admin edits should be in sync with the main RAG, so both taken into concideration when the text for voice is created by haiku I need you to run a deep investigation, check internet if needed. Find the best tech stack available in 2025. 
 6. Need to have a simple soluiton to run both frontend and backend from the same app, using one script 
 7. I don't want to use docker 
 8. I want to have the best practices implemented, proper logger, proper use of env variables from env files 
 9. Never hardcoded values, never mocks, only real data 
 10. DBs (content) will be in the cloud, I want to use supabase. Select the best DB for embedding, not sire if it should be local or cloud hosted as well 
 11. Web UX shooul be modern, nice and very simple, clear how to use the player, with additional info of the program, DJs etc 
 12 Frontend should be integrated with backend 
 13. I want ot not just support the web, but also more direct streaming options (youtube etc)