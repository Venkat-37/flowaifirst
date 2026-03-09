import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth'

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

const app      = initializeApp(firebaseConfig)
export const auth     = getAuth(app)
export const provider = new GoogleAuthProvider()

provider.addScope('email')
provider.addScope('profile')

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, provider)
  const idToken = await result.user.getIdToken()
  return { user: result.user, idToken }
}

export async function signOutUser() {
  await signOut(auth)
}
