// == Import : npm
import { connect } from 'react-redux';


// == Import : local
import Hosting from '@src/Components/Hosting';
import { getDomains, storeData } from '@js/store/reducer';


/* === State (données) ===
* - mapStateToProps retroune un objet de props pour le composant de présentation
* - mapStateToProps met à dispo 2 params
*  - state : le state du store (getState)
*  - ownProps : les props passées au container
* Pas de data à transmettre ? const mapStateToProps = null;
*/
const mapStateToProps = (state, ownProps) => ({
    domains: state.domains ?? null,
});


/* === Actions ===
* - mapDispatchToProps retroune un objet de props pour le composant de présentation
* - mapDispatchToProps met à dispo 2 params
*  - dispatch : la fonction du store pour dispatcher une actio
*  - ownProps : les props passées au container
* Pas de disptach à transmettre ? const mapDispatchToProps = {};
*/
const mapDispatchToProps = (dispatch, ownProps) => ({
    storeData: (key, value) => (dispatch(storeData(key, value))),
});


// Container
const HostingContainer = connect(
mapStateToProps,
mapDispatchToProps,
)(Hosting);


// == Export
export default HostingContainer;


/* = export à la volée
export default connect(
mapStateToProps,
mapDispatchToProps,
)(Hosting);
*/