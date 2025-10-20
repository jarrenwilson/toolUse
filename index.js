import 'dotenv/config';
import { HumanMessage, AIMessage, ToolMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { tool } from "@langchain/core/tools";
import axios from "axios";
import { z } from "zod";

// gets NBA player stats using BALLDONTLIE api
const getPlayerStats = tool(
  async ({ player_name, season = 2016 }) => {
    console.log(`Player stats for ${player_name} in the ${season} Season`);
    const headers = { Authorization: process.env.BALLDONTLIE_API_KEY };

    // used google gemini to help me understand how to access the API
    try {
      const searchPlayer = await axios.get(
        `https://api.balldontlie.io/v1/players?search=${encodeURIComponent(player_name)}`,
        { headers }
      );
      
      const player = searchPlayer.data.data[0];
      
      if (!player){
        return "Player not found.";
      }

      const searchStats = await axios.get(
        `https://api.balldontlie.io/v1/season_averages?season=${season}&player_ids[]=${player.id}`,
        { headers }
      );

      const stats = searchStats.data.data[0];
      if (!stats){
        return `No stats for ${player.first_name} ${player.last_name} in season ${season}.`;
      }

      return {
        name: `${player.first_name} ${player.last_name}`,
        team: player.team.full_name,
        position: player.position || "N/A",
        season,
        points_per_game: stats.pts,
        rebounds_per_game: stats.reb,
        assists_per_game: stats.ast,
        steals_per_game: stats.stl,
        blocks_per_game: stats.blk,
        minutes_per_game: stats.min
      };
    } catch (error) {
      console.error(error.message);
      return "Error";
    }
  },
  {
    name: "get_player_stats",
    description: "Gets stats for NBA players for the 2016 season.",
    schema: z.object({
      player_name: z.string().describe("Full name of NBA player"),
      season: z.number().describe("NBA Season")
    })
  }
);

async function main(){         
  const model = new ChatGoogleGenerativeAI({
    model: "gemini-2.0-flash",
    temperature: 0
  });
  
  const tools = { get_player_stats: getPlayerStats };
  const modelWithTools = model.bindTools([getPlayerStats]);
  
  const firstResponse = await modelWithTools.invoke([
    new HumanMessage("What is Stephen Curry's stats for the 2016 NBA season")
  ]);
  
  // used google gemini to generate this portion of the program
  console.log("Content:", firstResponse.content);
  console.log("Tool Calls:", firstResponse.tool_calls); 
  
  if (firstResponse.tool_calls && firstResponse.tool_calls.length > 0) {
    const toolCall = firstResponse.tool_calls[0]; 
    const toolName = toolCall.name;
    const toolArgs = toolCall.args;
    const toolCallId = toolCall.id;
        
    const toolOutput = await tools[toolName].invoke(toolArgs);
    const secondResponse = await model.invoke([
        new HumanMessage("What is Steph Curry's stats for the 2016 NBA season"),
        firstResponse,
        new ToolMessage({
            content: JSON.stringify(toolOutput),
            tool_call_id: toolCallId,
        })
    ]);
    console.log(secondResponse.content);
  } else {
    console.log("\nModel answered directly:", firstResponse.content);
  }
}

main();
