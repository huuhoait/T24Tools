*-----------------------------------------------------------------------------
*  Program               : ACCOUNT.EXTRACT
*  Developed By          : Zain Kamali
*  Purpose               : Extract account balances for the GL report
*-----------------------------------------------------------------------------

    SUBROUTINE ACCOUNT.EXTRACT

    $INSERT I_COMMON
    $INSERT I_EQUATE
    $INSERT I_F.ACCOUNT

    GOSUB INIT
    GOSUB PROCESS

    RETURN

********
INIT:
********
    FN.ACC = "F.ACCOUNT"
    F.ACC = ""
    CALL OPF(FN.ACC,F.ACC)
    RETURN

********
PROCESS:
********
    CALL F.READ(FN.ACC,Y.ACC.ID,R.ACC,F.ACC,E.ACC)
    Y.CUSTOMER = R.ACC<1>
    Y.BALANCE = R.ACC<AC.ONLINE.ACTUAL.BAL>
    CALL ACCOUNT.EXTRACT.HELPER(Y.ACC.ID, Y.BALANCE)
    CRT "ACCOUNT.EXTRACT finished"
    RETURN

END
