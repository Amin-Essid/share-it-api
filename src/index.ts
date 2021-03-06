import "reflect-metadata";
import "dotenv-safe/config";
// npx typeorm migration:generate -n Initial
import { __prod__, COOKIE_NAME } from "./constants";
import express from "express";
import { ApolloServer } from "apollo-server-express";
import { buildSchema } from "type-graphql";
import { HelloResolver } from "./resolvers/hello";
import { PostResolver } from "./resolvers/post";
import { UserResolver } from "./resolvers/user";
import Redis from "ioredis";
import session from "express-session";
import connectRedis from "connect-redis";
import cors from "cors";
import { createConnection } from "typeorm";
import path from "path";
import { Post } from "./entities/Post";
import { User } from "./entities/User";
import { Upvote } from "./entities/UpVote";
import { createUserLoader } from "./utils/createUserLoader";
import { createupvoteLoader } from "./utils/createUpvoteLoader";
import { FileResolver } from "./resolvers/file";

const main = async () => {
  const conn = await createConnection({
    type: "postgres",
    url: process.env.DATABASE_URL,
    logging: true,
    // synchronize: true,
    migrations: [path.join(__dirname, "./migrations/*")],
    entities: [Post, User, Upvote],
  });
  await conn.runMigrations();

  // await Post.delete({});
  // await Like.delete({});

  const app = express();
  app.use("/files", express.static(path.join(__dirname, "../files")));

  const RedisStore = connectRedis(session);
  const redis = new Redis(process.env.REDIS_URL);
  const corsConfig = {
    origin: process.env.CORS_ORIGIN,
    credentials: true,
  };
  app.set("trust proxy", 1);
  app.use(cors(corsConfig));
  app.use(
    session({
      name: COOKIE_NAME,
      store: new RedisStore({
        client: redis,
        disableTouch: true,
      }),
      cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365 * 10, // 10 years
        httpOnly: true,
        secure: __prod__, // cookie only works in https
        sameSite: "lax",
        domain: __prod__ ? "$your-costum-domain" : undefined, //so that cookies can pass from backend to frontend
        // use those with a costum domain to pass the cookies in production
      },
      saveUninitialized: false,
      secret: process.env.SESSION_SECRET,
      resave: false,
    })
  );

  const apolloServer = new ApolloServer({
    // typeDefs,
    schema: await buildSchema({
      resolvers: [HelloResolver, PostResolver, UserResolver, FileResolver],
      validate: false,
    }),
    context: ({ req, res }) => ({
      req,
      res,
      redis,
      userLoader: createUserLoader(),
      upvoteLoader: createupvoteLoader(),
    }),
  });

  apolloServer.applyMiddleware({
    app,
    cors: corsConfig,
  });

  //use parseInt(process.env.PORT) in developement if needed
  app.listen(process.env.PORT, () => {
    console.log("server started on localhost:4000");
  });
};

main().catch((err) => {
  console.error(err);
});
