import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { env } from './env.js';
import { userRepository } from '../repositories/userRepository.js';

passport.use(
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value?.toLowerCase();

        if (!email) {
          return done(new Error('Google account email not found'), null);
        }

        let user = await userRepository.findPublicByEmail(email);

        if (!user) {
          user = await userRepository.create({
            name: profile.displayName || 'Google User',
            email,
            googleId: profile.id,
            isVerified: true,
            profilePic: profile.photos?.[0]?.value || '',
          });
        } else {
          let changed = false;

          if (!user.googleId) {
            user.googleId = profile.id;
            changed = true;
          }

          if (!user.isVerified) {
            user.isVerified = true;
            changed = true;
          }

          if (!user.profilePic && profile.photos?.[0]?.value) {
            user.profilePic = profile.photos[0].value;
            changed = true;
          }

          if (changed) {
            await userRepository.save(user);
          }
        }

        return done(null, user);
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

export default passport;