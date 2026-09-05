(function(){
  const firebaseConfig = {
    apiKey: "AIzaSyBfBVw32bCQnIE_xLgZgsjUwhkBnLPHvOI",
    authDomain: "box0-238b3.firebaseapp.com",
    databaseURL: "https://box0-238b3-default-rtdb.firebaseio.com",
    projectId: "box0-238b3",
    storageBucket: "box0-238b3.firebasestorage.app",
    messagingSenderId: "210150614938",
    appId: "1:210150614938:web:013a6e678f81dcd44a3c23",
    measurementId: "G-8PQGKJBRHN"
  };
  const ORG_ID='amin-main';
  const ADMIN_EMAIL='mjdshbyr449@gmail.com';
  if(!firebase.apps.length) firebase.initializeApp(firebaseConfig);
  const app=firebase.app();
  const db=app.firestore();
  const auth=app.auth();
  const provider=new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({prompt:'select_account'});
  try { db.enablePersistence({synchronizeTabs:true}).catch(()=>{}); } catch(e) {}
  const onAuthStateChanged=fn=>auth.onAuthStateChanged(fn);
  const signInWithPopup=(a,p)=>a.signInWithPopup(p);
  const signOut=a=>a.signOut();
  const collection=(parent,name)=>parent.collection(name);
  const doc=(parent,id)=> id===undefined ? parent.doc() : parent.doc(String(id));
  const getDoc=ref=>ref.get();
  const getDocs=ref=>ref.get();
  const setDoc=(ref,data)=>ref.set(data);
  const addDoc=(ref,data)=>ref.add(data);
  const updateDoc=(ref,data)=>ref.update(data);
  const deleteDoc=ref=>ref.delete();
  const writeBatch=()=>db.batch();
  const serverTimestamp=()=>firebase.firestore.FieldValue.serverTimestamp();
  const orgRef=db.collection('organizations').doc(ORG_ID);
  const orgCollection=name=>orgRef.collection(name);
  const orgDoc=(name,id)=>orgRef.collection(name).doc(String(id));
  Object.assign(window,{app,auth,db,provider,onAuthStateChanged,signInWithPopup,signOut,collection,doc,getDoc,getDocs,setDoc,addDoc,updateDoc,deleteDoc,writeBatch,serverTimestamp,ADMIN_EMAIL,ORG_ID,orgRef,orgCollection,orgDoc});
})();
