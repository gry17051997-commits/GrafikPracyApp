    return () => unsub();
  },[cloudUser]);

  useEffect(() => {
    if (!ready || !FIREBASE_ENABLED || !db || !cloudUser || cloudRole !== 'admin' || !locationConfigLoaded.current) return;
    setDoc(doc(db,'locationConfig','main'),{warehouseGeo,updatedAt:serverTimestamp(),updatedBy:cloudUser.uid},{merge:true}).catch(() => {});
  },[warehouseGeo,ready,cloudUser,cloudRole]);

  useEffect(() => {
    if (!FIREBASE_ENABLED || !auth || !db) return;

    let roleUnsub = null;

    const authUnsub = onAuthStateChanged(auth, async user => {
      const remember = (await AsyncStorage.getItem(REMEMBER_LOGIN_KEY)) === '1';
      setRememberLogin(remember);
      if (user && !remember) {
        try { await signOut(auth); } catch (e) {}
        setCloudUser(null);
        setCloudRole('employee');
        setCloudReady(true);