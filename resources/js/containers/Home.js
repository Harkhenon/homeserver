// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import Home from '../components/Home';
import { setServerInformations, storeData } from '../store/reducer';


/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    serverCpu: state.serverCpu ?? null,
    serverRam: state.serverRam ?? null,
    serverDisk: state.serverDisk ?? null,
    serverOs: state.serverOs ?? null,
    settings: state.settings ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    setServerInformations: (cpu, ram, disk, os) => (dispatch(setServerInformations(cpu, ram, disk, os))),
    storeData: (name, value) => (dispatch(storeData(name, value))),
});


// Container
const HomeContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(Home);


// == Export
export default HomeContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(Home);
*/