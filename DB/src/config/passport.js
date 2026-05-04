import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { userRepository } from '../repositories/userRepository.js';
import { generateAccessToken, generateRefreshToken } from '../utils/token.js';

passport.use(new GoogleStrategy({
  clientID: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  callbackURL: env.GOOGLE_CALLBACK_URL,
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;

    let user = await userRepository.findPublicByEmail(email);

    if (!user) {
      user = await userRepository.create({
        name: profile.displayName,
        email,
        password: null,
        isVerified: true,
        provider: 'google',
      });
    }

    const tokens = {
      accessToken: generateAccessToken(user._id),
      refreshToken: generateRefreshToken(user._id),
    };

    return done(null, { user, ...tokens });

  } catch (err) {
    return done(err, null);
  }
}));