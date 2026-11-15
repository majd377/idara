import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';
import { firebaseConfig, ORG_ID, ADMIN_EMAIL } from './firebase-config.js';
const app = initializeApp(firebaseConfig);
let db;
try { db = initializeFirestore(app,{localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
catch { db = getFirestore(app); }
const auth=getAuth(app); const provider=new GoogleAuthProvider(); provider.setCustomParameters({prompt:'select_account'});
const orgRef=doc(db,'organizations',ORG_ID);
const orgCollection=(name)=>collection(orgRef,name);
const orgDoc=(name,id)=>doc(orgRef,name,String(id));
export {app,auth,db,provider,onAuthStateChanged,signInWithPopup,signOut,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,ADMIN_EMAIL,ORG_ID,orgRef,orgCollection,orgDoc};
