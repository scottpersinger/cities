window.getAppointmentsForCancelling = async () => {
    console.log('Searching...');

    let payload = {

    };

    let data = await $vm.$wfGetData('-NNvaX5bFPuAZs3VFRgv', payload);

    console.log(data);
}